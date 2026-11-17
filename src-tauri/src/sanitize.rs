//! Sanitização de textos que entram na coluna `reason` do `bo_queue` e em logs.
//!
//! O spec M12 (passo 7) pede que `reason` **não vire depósito de narrativas ou dados
//! pessoais**; o campo deve carregar códigos técnicos e detalhes mínimos.
//!
//! - `sanitize_reason` remove controles e quebras de linha, colapsa espaços e
//!   corta em 300 caracteres. É a função aplicada ANTES da escrita no SQLite.
//! - `sanitize_for_log` roda em cima do mesmo pipeline, mas também mascara
//!   sequências longas de dígitos (CPF, B.O. com ano, números de documento).

pub const MAX_REASON_CHARS: usize = 300;

pub fn sanitize_reason(raw: &str) -> String {
    let mapped: String = raw
        .chars()
        .map(|c| {
            if c.is_control() || c == '\t' || c == '\n' || c == '\r' {
                ' '
            } else {
                c
            }
        })
        .collect();
    let compact: String = mapped.split_whitespace().collect::<Vec<_>>().join(" ");
    compact.chars().take(MAX_REASON_CHARS).collect()
}

pub fn sanitize_for_log(raw: &str) -> String {
    let base = sanitize_reason(raw);
    let chars: Vec<char> = base.chars().collect();
    let mut result = String::with_capacity(base.len());
    let mut i = 0;
    while i < chars.len() {
        if chars[i].is_ascii_digit() {
            let start = i;
            while i < chars.len() && chars[i].is_ascii_digit() {
                i += 1;
            }
            let run = i - start;
            if run >= 9 {
                for _ in 0..run {
                    result.push('#');
                }
            } else {
                for c in &chars[start..i] {
                    result.push(*c);
                }
            }
        } else {
            result.push(chars[i]);
            i += 1;
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_reason_replaces_newlines_and_control_chars() {
        let input = "linha 1\nlinha 2\r\nlinha 3\tcom tab";
        assert_eq!(sanitize_reason(input), "linha 1 linha 2 linha 3 com tab");
    }

    #[test]
    fn sanitize_reason_collapses_consecutive_whitespace() {
        assert_eq!(sanitize_reason("   a    b   "), "a b");
        assert_eq!(sanitize_reason(""), "");
        assert_eq!(sanitize_reason("   "), "");
    }

    #[test]
    fn sanitize_reason_truncates_at_300_chars() {
        let big = "x".repeat(500);
        let out = sanitize_reason(&big);
        assert_eq!(out.chars().count(), 300);
    }

    #[test]
    fn sanitize_reason_strips_null_and_other_control_bytes() {
        let input = "ok\0mais\x01texto\x1b[31mcor";
        let cleaned = sanitize_reason(input);
        assert!(!cleaned.contains('\0'));
        assert!(!cleaned.contains('\x01'));
        assert!(!cleaned.contains('\x1b'));
    }

    #[test]
    fn sanitize_for_log_masks_runs_of_9_or_more_digits() {
        // CPF (11 dígitos) sem pontuação é mascarado.
        assert_eq!(sanitize_for_log("CPF 12345678901"), "CPF ###########");
        // B.O. com ano sem barra ainda é mascarado se >=9 dígitos consecutivos.
        assert_eq!(sanitize_for_log("num 000000012026"), "num ############");
    }

    #[test]
    fn sanitize_for_log_preserves_bo_with_slash_year() {
        // O número típico "00000001/2026" tem a barra; dígitos antes (8) < 9, dígitos depois (4) < 9.
        let s = sanitize_for_log("B.O. 00000001/2026 registrado");
        assert_eq!(s, "B.O. 00000001/2026 registrado");
    }

    #[test]
    fn sanitize_for_log_preserves_small_numbers() {
        assert_eq!(
            sanitize_for_log("timeout 7000 ms após 3 tentativas"),
            "timeout 7000 ms após 3 tentativas"
        );
    }

    #[test]
    fn sanitize_for_log_still_normalizes_whitespace() {
        assert_eq!(sanitize_for_log("linha1\ne\n\n\nlinha2"), "linha1 e linha2");
    }
}
