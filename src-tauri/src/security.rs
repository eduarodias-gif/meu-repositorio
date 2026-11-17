//! Proteção de dados locais via DPAPI (Windows Data Protection API).
//!
//! `protect` cifra `plaintext` com a chave do usuário Windows atual (escopo
//! `CurrentUser`): só o mesmo usuário Windows na mesma máquina consegue
//! recuperar. Nenhum segredo é persistido pelo aplicativo — a chave fica
//! sob o perfil do usuário, gerenciada pelo próprio Windows. Em plataformas
//! fora do Windows as funções retornam erro — não há fallback sem proteção.
//!
//! Esta camada é a base de M12 para M6-M10 (relatos, minutas e artefatos
//! de leitura são conteúdo sensível e precisam cifrar antes do disco).

#[cfg(target_os = "windows")]
use std::os::raw::{c_ulong, c_void};
#[cfg(target_os = "windows")]
use std::ptr;

#[cfg(target_os = "windows")]
#[repr(C)]
#[derive(Default)]
struct CryptBlob {
    cb_data: c_ulong,
    pb_data: *mut u8,
}

#[cfg(target_os = "windows")]
#[link(name = "Crypt32")]
extern "system" {
    fn CryptProtectData(
        p_data_in: *const CryptBlob,
        sz_data_descr: *const u16,
        p_optional_entropy: *const CryptBlob,
        pv_reserved: *mut c_void,
        p_prompt_struct: *const c_void,
        dw_flags: c_ulong,
        p_data_out: *mut CryptBlob,
    ) -> i32;

    fn CryptUnprotectData(
        p_data_in: *const CryptBlob,
        pp_sz_data_descr: *mut *mut u16,
        p_optional_entropy: *const CryptBlob,
        pv_reserved: *mut c_void,
        p_prompt_struct: *const c_void,
        dw_flags: c_ulong,
        p_data_out: *mut CryptBlob,
    ) -> i32;
}

#[cfg(target_os = "windows")]
#[link(name = "Kernel32")]
extern "system" {
    fn LocalFree(h_mem: *mut c_void) -> *mut c_void;
    fn GetLastError() -> c_ulong;
}

#[cfg(target_os = "windows")]
pub fn protect(plaintext: &[u8]) -> Result<Vec<u8>, String> {
    if plaintext.len() > u32::MAX as usize {
        return Err("Conteúdo muito grande para DPAPI (> 4 GiB).".to_owned());
    }
    // `pb_data` precisa de ponteiro mutável pela ABI, mas CryptProtectData não modifica o input.
    let mut input_buf = plaintext.to_vec();
    let input = CryptBlob {
        cb_data: input_buf.len() as c_ulong,
        pb_data: if input_buf.is_empty() {
            ptr::null_mut()
        } else {
            input_buf.as_mut_ptr()
        },
    };
    let mut output = CryptBlob::default();
    let success = unsafe {
        CryptProtectData(
            &input,
            ptr::null(),
            ptr::null(),
            ptr::null_mut(),
            ptr::null(),
            0,
            &mut output,
        )
    };
    if success == 0 {
        let code = unsafe { GetLastError() };
        return Err(format!("DPAPI protect falhou (LastError=0x{code:08X})"));
    }
    let bytes =
        unsafe { std::slice::from_raw_parts(output.pb_data, output.cb_data as usize) }.to_vec();
    unsafe {
        LocalFree(output.pb_data as *mut c_void);
    }
    Ok(bytes)
}

#[cfg(target_os = "windows")]
pub fn unprotect(ciphertext: &[u8]) -> Result<Vec<u8>, String> {
    if ciphertext.is_empty() {
        return Err("Ciphertext vazio.".to_owned());
    }
    let mut input_buf = ciphertext.to_vec();
    let input = CryptBlob {
        cb_data: input_buf.len() as c_ulong,
        pb_data: input_buf.as_mut_ptr(),
    };
    let mut output = CryptBlob::default();
    let mut description: *mut u16 = ptr::null_mut();
    let success = unsafe {
        CryptUnprotectData(
            &input,
            &mut description,
            ptr::null(),
            ptr::null_mut(),
            ptr::null(),
            0,
            &mut output,
        )
    };
    if success == 0 {
        let code = unsafe { GetLastError() };
        return Err(format!("DPAPI unprotect falhou (LastError=0x{code:08X})"));
    }
    let bytes =
        unsafe { std::slice::from_raw_parts(output.pb_data, output.cb_data as usize) }.to_vec();
    unsafe {
        LocalFree(output.pb_data as *mut c_void);
        if !description.is_null() {
            LocalFree(description as *mut c_void);
        }
    }
    Ok(bytes)
}

#[cfg(not(target_os = "windows"))]
pub fn protect(_plaintext: &[u8]) -> Result<Vec<u8>, String> {
    Err("DPAPI só está disponível no Windows. SIED SYSTEM V5 não suporta cifrar dados sensíveis sem DPAPI nesta plataforma.".to_owned())
}

#[cfg(not(target_os = "windows"))]
pub fn unprotect(_ciphertext: &[u8]) -> Result<Vec<u8>, String> {
    Err("DPAPI só está disponível no Windows.".to_owned())
}

#[cfg(all(test, target_os = "windows"))]
mod tests {
    use super::*;

    #[test]
    fn protect_and_unprotect_round_trip_preserves_plaintext() {
        let plaintext = b"SIED V5 - texto confidencial sintetico";
        let ciphertext = protect(plaintext).expect("protect");
        assert_ne!(
            ciphertext.as_slice(),
            plaintext,
            "ciphertext não pode ser igual ao plaintext"
        );
        let recovered = unprotect(&ciphertext).expect("unprotect");
        assert_eq!(recovered.as_slice(), plaintext);
    }

    #[test]
    fn protect_binary_payload_round_trip() {
        let plaintext: Vec<u8> = (0..=255u8).cycle().take(4096).collect();
        let ciphertext = protect(&plaintext).unwrap();
        let recovered = unprotect(&ciphertext).unwrap();
        assert_eq!(recovered, plaintext);
    }

    #[test]
    fn unprotect_tampered_ciphertext_fails_cleanly() {
        let plaintext = b"sentinela";
        let mut ciphertext = protect(plaintext).unwrap();
        // Corrompe o último byte — DPAPI deve rejeitar.
        if let Some(last) = ciphertext.last_mut() {
            *last = last.wrapping_add(1);
        }
        let err = unprotect(&ciphertext).unwrap_err();
        assert!(
            err.contains("DPAPI unprotect falhou"),
            "mensagem foi: {err}"
        );
    }

    #[test]
    fn unprotect_rejects_empty_input() {
        let err = unprotect(&[]).unwrap_err();
        assert!(err.contains("vazio"), "mensagem: {err}");
    }
}
