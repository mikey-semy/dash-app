#!/usr/bin/env python3
"""Publish only validated DU host rules; never accept arbitrary proxy configuration."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time

ROOT = Path('/root/apps/s3-flash-drive')
DYNAMIC = Path('/root/infra/traefik/dynamic')
NAME = 'holder-sites.yml'
DOMAIN = re.compile(r'(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]*$')

def hosts(text):
    result = set()
    for call in re.findall(r'\bHost\(([^)]+)\)', text):
        result.update(re.findall(r'[`\"]([^`\"]+)[`\"]', call))
    return result

def reserved_hosts():
    result = set()
    ids = subprocess.check_output(['docker','ps','-q'], text=True).split()
    if ids:
        labels = subprocess.check_output(['docker','inspect','--format','{{json .Config.Labels}}',*ids], text=True)
        for line in labels.splitlines():
            for key,value in (json.loads(line) or {}).items():
                if key.startswith('traefik.http.routers.') and key.endswith('.rule'):
                    result.update(hosts(value))
    for path in DYNAMIC.rglob('*'):
        if path.is_file() and path.name != NAME and path.suffix.lower() in {'.yaml','.yml','.toml'}:
            result.update(hosts(path.read_text()))
    return result

def configuration(domains, reserved, resolver='letsencrypt'):
    routers, status = {}, {}
    for domain in sorted({d for d in domains if isinstance(d,str)}):
        if not isinstance(domain,str) or not DOMAIN.fullmatch(domain):
            continue
        if domain in reserved:
            status[domain]='reserved'
            continue
        key='holder-site-'+hashlib.sha256(domain.encode()).hexdigest()[:20]
        routers[key]={'rule':f'Host(`{domain}`)','entryPoints':['websecure'],'service':'flash@docker','tls':{'certResolver':resolver},'observability':{'accessLogs':False}}
        routers[key+'-http']={'rule':f'Host(`{domain}`)','entryPoints':['web'],'service':'flash@docker','middlewares':['redirect-to-https@file'],'observability':{'accessLogs':False}}
        status[domain]='configured'
    return {'http':{'routers':routers}}, status

def write_changed(path, value):
    content=json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':'))+'\n'
    if path.exists() and path.read_text()==content:
        return
    with tempfile.NamedTemporaryFile(mode='w',encoding='utf-8',dir=path.parent,prefix=path.name+'.',suffix='.tmp',delete=False) as file:
        file.write(content)
        temp=Path(file.name)
    try:
        os.chmod(temp,0o644)
        os.replace(temp,path)
    finally:
        temp.unlink(missing_ok=True)

def synchronize(reserved=None, disable=False):
    source=ROOT/'sites-export'/'domains.json'
    if source.exists() and source.stat().st_size>300000:
        raise ValueError('DU domains export too large')
    data={'domains':[]} if disable or not source.exists() else json.loads(source.read_text())
    if not isinstance(data,dict) or not isinstance(data.get('domains'),list) or len(data['domains'])>1000:
        raise ValueError('Invalid DU domains export')
    if source.exists() and source.stat().st_size>300000:
        raise ValueError('DU domains export too large')
    resolver='letsencrypt'
    for line in (ROOT/'.env').read_text().splitlines():
        if line.startswith('TRAEFIK_CERTRESOLVER='):
            resolver=line.split('=',1)[1].strip().strip('"\'')
    if not re.fullmatch(r'[a-zA-Z0-9_-]+',resolver):
        raise ValueError('Invalid certificate resolver')
    config,status=configuration(data['domains'],reserved if reserved is not None else reserved_hosts(),resolver)
    write_changed(DYNAMIC/NAME,config)
    write_changed(ROOT/'sites-export'/'status.json',status)

if __name__=='__main__':
    if '--watch' in sys.argv:
        reserved=set(); refresh=0
        while True:
            try:
                if time.monotonic()>refresh:
                    reserved=reserved_hosts();refresh=time.monotonic()+30
                synchronize(reserved)
            except Exception as error:
                print('[dash-app] domain routing:',str(error),file=sys.stderr,flush=True)
            time.sleep(2)
    else:
        synchronize(disable='--disable' in sys.argv)
