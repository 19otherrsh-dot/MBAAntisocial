import type { Model, Schema, SchemaType } from 'mongoose';

type Typed = SchemaType & { options?: { ref?: string; type?: unknown }; caster?: { options?: { ref?: string } }; schema?: Schema };

const refOf = (t: Typed) => t.options?.ref ?? t.caster?.options?.ref ?? (Array.isArray(t.options?.type) ? (t.options.type[0] as { ref?: string })?.ref : undefined);

/**
 * Every path in a model that refers to a User: `field`, `list.field` inside an
 * array of sub-documents, and `map.$*` for a map of id arrays.
 */
export function userRefPaths(model: Model<unknown>): string[] {
  const paths: string[] = [];
  model.schema.eachPath((path, type) => {
    const t = type as Typed;
    if (refOf(t) === 'User') paths.push(path);
    t.schema?.eachPath((sub, subType) => {
      if (refOf(subType as Typed) === 'User') paths.push(`${path}.${sub}`);
    });
  });
  return paths;
}

/** For `list.field` inside an array of sub-documents, the array and the field; otherwise null. */
export function splitSubdocumentPath(model: Model<unknown>, path: string): { list: string; field: string } | null {
  const parts = path.split('.');
  for (let i = parts.length - 1; i > 0; i -= 1) {
    const list = parts.slice(0, i).join('.');
    const type = model.schema.path(list) as Typed | undefined;
    if (type?.schema) return { list, field: parts.slice(i).join('.') };
  }
  return null;
}
