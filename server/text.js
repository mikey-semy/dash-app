import { resourceName } from "../src/resource-name.js";
import languages from "../src/text-languages.json" with { type: "json" };
import { mediaType } from "./media.js";
import { archiveTextObject } from "./archive-text.js";
import { TextDecoder } from "node:util";
export const TEXT_LIMIT = 5 * 1024 * 1024;
const extensions = new Set([
  ...languages.flatMap((language) =>
    language.extensions.map((extension) => extension.toLowerCase()),
  ),
  ..."txt,text,log,csv,tsv,conf,cfg,ini,config,env,gitignore,gitattributes,editorconfig,npmrc,yarnrc,dockerignore,prettierignore,prettierrc,eslintrc,babelrc,browserslistrc,lock,jsonl,ndjson,ipynb,rst,adoc,tex,mdx,srt,vtt,properties,manifest,pem,pub,bat,cmd,psm1,psd1,vue,svelte,astro,graphql,gql,prisma,proto,service,socket,timer,target,path,desktop,diff,patch,tf,tfvars,hcl,rules,sh,zsh,fish,bash,sql,yml,yaml,toml".split(
    ",",
  ),
]);
const knownNames =
  /^(?:readme|license|licence|notice|changelog|authors|contributing|install|todo|copying|version|dockerfile|makefile|gemfile|rakefile|procfile|justfile|jenkinsfile|cmakelists\.txt)$/i;
export function fileTextCandidate(file) {
  if (
    !file ||
    file.directory ||
    file.name?.endsWith("/") ||
    file.size > TEXT_LIMIT ||
    mediaType(file)
  )
    return false;
  const name = resourceName(file.name || "")
      .split("/")
      .pop(),
    extension = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
  return (
    knownNames.test(name) ||
    /^\.env(?:\.|$)/i.test(name) ||
    extensions.has(extension) ||
    languages.some(
      (language) =>
        language.filename &&
        new RegExp(language.filename.source, language.filename.flags).test(
          name,
        ),
    ) ||
    (file.size === 0 && !extension)
  );
}
export function textCandidate(t) {
  return (
    t.files.length === 1 && !!t.output?.key && fileTextCandidate(t.files[0])
  );
}
export function validText(buffer) {
  try {
    const text = new TextDecoder("utf-8", {
      fatal: true,
      ignoreBOM: true,
    }).decode(buffer);
    return !/[\x00-\x08\x0b\x0e-\x1f]/.test(text) && !text.startsWith("%PDF-");
  } catch {
    return false;
  }
}
export function textReader(store) {
  const cache = new Map(),
    pending = new Map(),
    waiters = [];
  let bytes = 0,
    active = 0;
  return async function read(t, index) {
    const key = JSON.stringify([t.output.key, t.output.etag, index]);
    if (cache.has(key)) {
      const value = cache.get(key);
      cache.delete(key);
      cache.set(key, value);
      return value;
    }
    if (pending.has(key)) return pending.get(key);
    const task = (async () => {
      if (active >= 4) await new Promise((resolve) => waiters.push(resolve));
      else active++;
      try {
        const object =
            index !== undefined && t.files.length > 1
              ? await archiveTextObject(store, t, index)
              : await store.get(t.output.key),
          chunks = [];
        let size = 0;
        try {
          for await (const chunk of object.Body) {
            size += chunk.length;
            if (size > TEXT_LIMIT)
              throw Object.assign(new Error("Текст слишком большой"), {
                status: 415,
              });
            chunks.push(Buffer.from(chunk));
          }
        } finally {
          object.Body.destroy?.();
        }
        if (
          size !== (index === undefined ? t.output.size : t.files[index].size)
        )
          throw new Error("Object size mismatch");
        const buffer = Buffer.concat(chunks);
        if (!validText(buffer))
          throw Object.assign(new Error("Неподдерживаемый текст"), {
            status: 415,
          });
        while (cache.size && bytes + size > 20 * 1024 * 1024) {
          const oldest = cache.keys().next().value;
          bytes -= cache.get(oldest).length;
          cache.delete(oldest);
        }
        cache.set(key, buffer);
        bytes += size;
        while (cache.size > 32) {
          const oldest = cache.keys().next().value;
          bytes -= cache.get(oldest).length;
          cache.delete(oldest);
        }
        return buffer;
      } finally {
        const next = waiters.shift();
        if (next) next();
        else active--;
      }
    })();
    pending.set(key, task);
    try {
      return await task;
    } finally {
      pending.delete(key);
    }
  };
}
