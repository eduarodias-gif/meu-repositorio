//! Diretório de dados locais com operações estritamente escopadas e cifragem DPAPI.
//!
//! Regras de segurança desta camada (M12):
//!
//! - Toda operação recebe `root: &Path` explícito e um `subpath: &str` relativo.
//! - `resolve_within` rejeita paths absolutos, componentes `..`, prefixos de volume
//!   (`C:`, `\\server\share`) e strings vazias. Isso bloqueia escapes sintáticos
//!   para fora do root.
//! - `secure_write` cifra com DPAPI antes de persistir. `secure_read` decifra antes
//!   de devolver bytes. Nenhum caminho de código escreve conteúdo sensível em claro.
//! - `delete_within` e `list_within` operam exclusivamente dentro do root validado.
//! - `app_data_root(app)` continua sendo a única via para descobrir o root real do
//!   aplicativo (abstração sobre `AppHandle::path::app_data_dir`). Fora de produção,
//!   testes passam um root arbitrário em diretório temporário.

use std::fs;
use std::path::{Component, Path, PathBuf};
use tauri::{AppHandle, Manager};

pub fn app_data_root(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|err| err.to_string())?;
    fs::create_dir_all(&dir).map_err(|err| err.to_string())?;
    Ok(dir)
}

/// Resolve `subpath` dentro de `root`, aplicando checagens sintáticas defensivas.
/// NUNCA retorna um caminho fora de `root`.
pub fn resolve_within(root: &Path, subpath: &str) -> Result<PathBuf, String> {
    if subpath.is_empty() {
        return Err("subpath vazio não é permitido".to_owned());
    }
    if subpath.len() > 512 {
        return Err("subpath muito longo (>512 caracteres)".to_owned());
    }
    let sub = Path::new(subpath);
    if sub.is_absolute() {
        return Err(format!("subpath absoluto bloqueado: {subpath}"));
    }
    for component in sub.components() {
        match component {
            Component::Normal(_) => {}
            Component::CurDir => {}
            Component::ParentDir => {
                return Err(format!("subpath contém `..`: {subpath}"));
            }
            Component::RootDir => {
                return Err(format!("subpath com separador raiz: {subpath}"));
            }
            Component::Prefix(_) => {
                return Err(format!("subpath com prefixo de volume: {subpath}"));
            }
        }
    }
    Ok(root.join(sub))
}

/// Cria um diretório vazio sob `root` dado um `subpath` relativo seguro.
pub fn ensure_dir(root: &Path, subpath: &str) -> Result<PathBuf, String> {
    let path = resolve_within(root, subpath)?;
    fs::create_dir_all(&path).map_err(|err| err.to_string())?;
    Ok(path)
}

/// Escreve `plaintext` cifrado com DPAPI em `root/subpath`. Cria diretórios pai sob demanda.
pub fn secure_write(root: &Path, subpath: &str, plaintext: &[u8]) -> Result<(), String> {
    let path = resolve_within(root, subpath)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    let ciphertext = super::security::protect(plaintext)?;
    // Escreve via arquivo temporário + rename para reduzir risco de arquivo corrompido em caso de queda.
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, &ciphertext).map_err(|err| err.to_string())?;
    fs::rename(&tmp, &path).map_err(|err| err.to_string())?;
    Ok(())
}

/// Lê e decifra arquivo em `root/subpath`. Falha se o arquivo não existir.
pub fn secure_read(root: &Path, subpath: &str) -> Result<Vec<u8>, String> {
    let path = resolve_within(root, subpath)?;
    let ciphertext = fs::read(&path).map_err(|err| err.to_string())?;
    super::security::unprotect(&ciphertext)
}

/// Lista entradas em `root/subpath` (não recursivo). Apenas nomes; caminhos absolutos ficam no retorno.
pub fn list_within(root: &Path, subpath: &str) -> Result<Vec<PathBuf>, String> {
    let path = resolve_within(root, subpath)?;
    if !path.exists() {
        return Ok(vec![]);
    }
    let mut out = vec![];
    for entry in fs::read_dir(&path).map_err(|err| err.to_string())? {
        let entry = entry.map_err(|err| err.to_string())?;
        out.push(entry.path());
    }
    out.sort();
    Ok(out)
}

/// Escreve `bytes` em texto plano em `root/subpath`. Cria diretórios pai sob demanda.
/// Use para **configuração e preferências** (horários, filtros, flags) que não são
/// sensíveis e que o usuário precisa conseguir inspecionar sem o app rodar.
/// Para conteúdo sensível (relato, minuta, hash de sessão), use `secure_write`.
pub fn write_plain(root: &Path, subpath: &str, bytes: &[u8]) -> Result<(), String> {
    let path = resolve_within(root, subpath)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, bytes).map_err(|err| err.to_string())?;
    fs::rename(&tmp, &path).map_err(|err| err.to_string())?;
    Ok(())
}

/// Lê um arquivo plain em `root/subpath`. Falha se o arquivo não existir.
pub fn read_plain(root: &Path, subpath: &str) -> Result<Vec<u8>, String> {
    let path = resolve_within(root, subpath)?;
    fs::read(&path).map_err(|err| err.to_string())
}

/// Retorna `true` se o arquivo em `root/subpath` existe.
pub fn exists_within(root: &Path, subpath: &str) -> Result<bool, String> {
    let path = resolve_within(root, subpath)?;
    Ok(path.exists())
}

/// Remove um arquivo ou diretório (recursivo) dentro de `root/subpath`.
/// Segurança: só opera sob o root já validado.
pub fn delete_within(root: &Path, subpath: &str) -> Result<(), String> {
    let path = resolve_within(root, subpath)?;
    if !path.exists() {
        return Ok(());
    }
    // Defesa adicional: confirma que o destino canônico fica DENTRO do root canônico.
    // Isso cobre casos em que o filesystem resolveria symlinks não detectados pela checagem sintática.
    let root_canon = root.canonicalize().map_err(|err| err.to_string())?;
    let path_canon = path.canonicalize().map_err(|err| err.to_string())?;
    if !path_canon.starts_with(&root_canon) {
        return Err(format!(
            "delete_within: alvo canônico fora do root ({} ⊄ {})",
            path_canon.display(),
            root_canon.display()
        ));
    }
    if path.is_dir() {
        fs::remove_dir_all(&path).map_err(|err| err.to_string())?;
    } else {
        fs::remove_file(&path).map_err(|err| err.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static COUNTER: AtomicU64 = AtomicU64::new(0);

    fn temp_root(tag: &str) -> PathBuf {
        let id = COUNTER.fetch_add(1, Ordering::SeqCst);
        let path =
            std::env::temp_dir().join(format!("sied-m12-{}-{}-{}", std::process::id(), tag, id));
        fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn resolve_within_accepts_simple_subpath_and_nested_subpath() {
        let root = temp_root("resolve-ok");
        let p1 = resolve_within(&root, "a.txt").unwrap();
        assert_eq!(p1, root.join("a.txt"));
        let p2 = resolve_within(&root, "sub/dir/b.txt").unwrap();
        assert!(p2.starts_with(&root));
        assert!(
            p2.ends_with(Path::new("sub/dir/b.txt")) || p2.ends_with(Path::new("sub\\dir\\b.txt"))
        );
    }

    #[test]
    fn resolve_within_rejects_dotdot_absolute_and_empty_paths() {
        let root = temp_root("resolve-reject");
        assert!(resolve_within(&root, "").is_err());
        assert!(resolve_within(&root, "..").is_err());
        assert!(resolve_within(&root, "a/../b").is_err());
        assert!(resolve_within(&root, "../fora.txt").is_err());
        #[cfg(windows)]
        {
            assert!(resolve_within(&root, "C:\\Windows\\win.ini").is_err());
            assert!(resolve_within(&root, "\\\\server\\share\\x").is_err());
            assert!(resolve_within(&root, "\\absolute").is_err());
        }
        #[cfg(not(windows))]
        {
            assert!(resolve_within(&root, "/etc/passwd").is_err());
        }
    }

    #[test]
    #[cfg(target_os = "windows")]
    fn secure_write_then_read_round_trip() {
        let root = temp_root("secure-rw");
        let plaintext = b"relato sintetico de teste m12";
        secure_write(&root, "artefatos/leitura.bin", plaintext).unwrap();
        // O arquivo em disco NÃO é o plaintext — comprova que a camada cifra.
        let raw = fs::read(root.join("artefatos/leitura.bin")).unwrap();
        assert_ne!(raw.as_slice(), plaintext.as_slice());
        let got = secure_read(&root, "artefatos/leitura.bin").unwrap();
        assert_eq!(got.as_slice(), plaintext.as_slice());
    }

    #[test]
    #[cfg(target_os = "windows")]
    fn secure_write_uses_tmp_and_rename_pattern() {
        let root = temp_root("secure-atomic");
        secure_write(&root, "x.bin", b"ok").unwrap();
        // Não deve haver arquivos .tmp residuais após a operação concluída.
        let residuais: Vec<_> = fs::read_dir(&root)
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_name().to_string_lossy().ends_with(".tmp"))
            .collect();
        assert!(
            residuais.is_empty(),
            "arquivos .tmp residuais: {residuais:?}"
        );
    }

    #[test]
    fn list_within_returns_empty_for_missing_subdir() {
        let root = temp_root("list-missing");
        let result = list_within(&root, "nao-existe").unwrap();
        assert!(result.is_empty());
    }

    #[test]
    fn delete_within_rejects_path_resolving_outside_root() {
        let root = temp_root("delete-escape");
        // Cria um arquivo real fora do root, depois tenta deletá-lo via subpath "..". A
        // checagem sintática em resolve_within já barra. Apenas validamos a mensagem.
        let err = delete_within(&root, "../fora.bin").unwrap_err();
        assert!(err.contains("`..`"), "mensagem foi: {err}");
    }

    #[test]
    fn delete_within_removes_existing_file() {
        let root = temp_root("delete-ok");
        let target = root.join("rm.bin");
        fs::write(&target, b"bytes").unwrap();
        assert!(target.exists());
        delete_within(&root, "rm.bin").unwrap();
        assert!(!target.exists());
    }

    #[test]
    fn delete_within_noop_for_missing_file() {
        let root = temp_root("delete-noop");
        delete_within(&root, "inexistente.bin").unwrap();
    }

    #[test]
    fn write_plain_round_trips_bytes_and_cleans_tmp() {
        let root = temp_root("plain-rw");
        let payload = b"{\"a\":1}";
        write_plain(&root, "conf/schedule.json", payload).unwrap();
        let got = read_plain(&root, "conf/schedule.json").unwrap();
        assert_eq!(got, payload.to_vec());
        // Nada de .tmp residual
        let residuais: Vec<_> = fs::read_dir(root.join("conf"))
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_name().to_string_lossy().ends_with(".tmp"))
            .collect();
        assert!(residuais.is_empty());
    }

    #[test]
    fn exists_within_returns_false_for_missing_and_true_for_present() {
        let root = temp_root("plain-exists");
        assert!(!exists_within(&root, "x.json").unwrap());
        write_plain(&root, "x.json", b"{}").unwrap();
        assert!(exists_within(&root, "x.json").unwrap());
    }

    #[test]
    fn write_plain_rejects_dotdot_escape() {
        let root = temp_root("plain-escape");
        let err = write_plain(&root, "../out.json", b"x").unwrap_err();
        assert!(err.contains("`..`"));
    }

    #[test]
    fn list_within_lists_direct_children_sorted() {
        let root = temp_root("list-ok");
        fs::write(root.join("b.txt"), b"b").unwrap();
        fs::write(root.join("a.txt"), b"a").unwrap();
        fs::create_dir_all(root.join("sub")).unwrap();
        fs::write(root.join("sub/c.txt"), b"c").unwrap();

        let out = list_within(&root, ".").unwrap();
        let names: Vec<String> = out
            .iter()
            .map(|p| p.file_name().unwrap().to_string_lossy().into_owned())
            .collect();
        assert_eq!(
            names,
            vec!["a.txt".to_string(), "b.txt".to_string(), "sub".to_string()]
        );

        let out_sub = list_within(&root, "sub").unwrap();
        assert_eq!(out_sub.len(), 1);
    }
}
