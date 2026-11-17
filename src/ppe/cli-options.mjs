export function parseInspectionArgs(args) {
  const options = { number: null };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument !== '--number') throw new Error(`Opção não reconhecida: ${argument}`);
    if (options.number !== null) throw new Error('Use --number uma única vez.');
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error('Informe um valor após --number.');
    options.number = value.normalize('NFKC').trim();
    index += 1;
  }
  return options;
}

