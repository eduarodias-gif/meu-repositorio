function structuralReason(prefix, reasons, fallback) {
  const clean = Array.isArray(reasons)
    ? reasons.filter(reason => typeof reason === 'string' && reason.trim()).map(reason => reason.trim())
    : [];
  const detail = clean.length ? clean.join('; ') : fallback;
  return `${prefix}${detail}`.slice(0, 300);
}

function hasReason(result, reason) {
  return Array.isArray(result?.reasons) && result.reasons.some(value => value === reason || value.startsWith(`${reason}:`));
}

export async function processQueueRows(rows, options) {
  if (!Array.isArray(rows)) throw new TypeError('A fila precisa ser uma lista.');
  if (typeof options?.readBo !== 'function') throw new TypeError('Leitor PPE não informado.');
  if (typeof options?.updateStatus !== 'function') throw new TypeError('Persistência da fila não informada.');

  const pending = rows.filter(row => row?.status === 'PENDENTE');
  const results = [];
  let stoppedReason = null;

  for (const row of pending) {
    if (options.signal?.aborted) {
      stoppedReason = 'CANCELADO';
      break;
    }

    await options.updateStatus(row.number, 'EM_LEITURA', 'Leitura estrutural iniciada.');
    options.onProgress?.({ number: row.number, status: 'EM_LEITURA' });

    let readResult;
    try {
      readResult = await options.readBo(row.number);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? 'ERRO_DESCONHECIDO');
      if (message.includes('SESSAO_EXPIRADA')) {
        await options.updateStatus(row.number, 'ERRO', 'Sessão oficial expirada. Autentique novamente no portal.');
        results.push({ number: row.number, outcome: 'ERROR' });
        stoppedReason = 'SESSAO_EXPIRADA';
        break;
      }
      if (message.includes('ACESSO_RESTRITO')) {
        await options.updateStatus(row.number, 'RESTRITO', 'Acesso restrito informado pelo PPE.');
        results.push({ number: row.number, outcome: 'RESTRICTED' });
        stoppedReason = 'ACESSO_RESTRITO';
        break;
      }
      await options.updateStatus(row.number, 'ERRO', `Falha técnica na leitura: ${message}`.slice(0, 300));
      results.push({ number: row.number, outcome: 'ERROR' });
      continue;
    }

    if (readResult?.completeness === 'CONCLUIDA') {
      await options.updateStatus(row.number, 'LIDO', 'Leitura estrutural concluída.');
      await options.updateStatus(row.number, 'EM_ANALISE', 'Análise local iniciada.');
      await options.updateStatus(row.number, 'MINUTA_GERADA', 'Minuta estrutural fictícia gerada localmente.');
      await options.updateStatus(row.number, 'AGUARDANDO_REVISAO', 'Minuta local pronta; revisão humana necessária.');
      results.push({ number: row.number, outcome: 'REVIEW' });
    } else if (readResult?.completeness === 'PARCIAL') {
      await options.updateStatus(
        row.number,
        'AGUARDANDO_REVISAO',
        structuralReason('Leitura parcial: ', readResult.reasons, 'estrutura incompleta.'),
      );
      results.push({ number: row.number, outcome: 'REVIEW' });
    } else if (readResult?.completeness === 'RESTRITA' || hasReason(readResult, 'ACESSO_RESTRITO')) {
      await options.updateStatus(row.number, 'RESTRITO', 'Acesso restrito informado pelo PPE.');
      results.push({ number: row.number, outcome: 'RESTRICTED' });
      stoppedReason = 'ACESSO_RESTRITO';
      break;
    } else if (hasReason(readResult, 'SESSAO_EXPIRADA')) {
      await options.updateStatus(row.number, 'ERRO', 'Sessão oficial expirada. Autentique novamente no portal.');
      results.push({ number: row.number, outcome: 'ERROR' });
      stoppedReason = 'SESSAO_EXPIRADA';
      break;
    } else {
      await options.updateStatus(
        row.number,
        'ERRO',
        structuralReason('Leitura interrompida: ', readResult?.reasons, 'resultado PPE não reconhecido.'),
      );
      results.push({ number: row.number, outcome: 'ERROR' });
    }

    options.onProgress?.({ number: row.number, outcome: results.at(-1).outcome });
  }

  if (!stoppedReason && options.signal?.aborted) stoppedReason = 'CANCELADO';
  return { processed: results.length, stoppedReason, results };
}

