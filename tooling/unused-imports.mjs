import traverse from "@babel/traverse";

export function unusedImports(ast) {
  const unused = [];
  traverse(ast, {
    Program(program) {
      for (const binding of Object.values(program.scope.bindings))
        if (binding.kind === "module" && !binding.referenced)
          unused.push(binding.identifier);
    },
  });
  return unused;
}
