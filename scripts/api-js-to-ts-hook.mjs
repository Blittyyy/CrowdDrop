/**
 * Lets Node tests load api/*.ts sources that use NodeNext `.js` import specifiers.
 */
export async function resolve(specifier, context, nextResolve) {
  if (
    (specifier.startsWith('./') || specifier.startsWith('../'))
    && specifier.endsWith('.js')
  ) {
    const tsSpecifier = `${specifier.slice(0, -3)}.ts`
    try {
      return await nextResolve(tsSpecifier, context)
    }
    catch {
      // fall through to default resolution
    }
  }

  return nextResolve(specifier, context)
}
