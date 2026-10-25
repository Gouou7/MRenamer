use crate::model::*;
use std::path::Path;

pub fn is_link(path: &Path) -> bool {
    let Ok(m) = std::fs::symlink_metadata(path) else {
        return false;
    };
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        m.file_attributes() & 0x400 != 0
    }
    #[cfg(not(windows))]
    {
        m.file_type().is_symlink()
    }
}
pub fn check_ancestors(path: &Path) -> Result<()> {
    if path.ancestors().any(is_link) {
        return Err(AppError::new("unsupportedLink", path.display()));
    }
    Ok(())
}
pub fn rename_no_replace(from: &Path, to: &Path) -> Result<()> {
    check_ancestors(from)?;
    check_ancestors(
        to.parent()
            .ok_or_else(|| AppError::new("invalidName", "parent"))?,
    )?;
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        let a: Vec<u16> = from.as_os_str().encode_wide().chain(Some(0)).collect();
        let b: Vec<u16> = to.as_os_str().encode_wide().chain(Some(0)).collect();
        // Flags 0 intentionally excludes MOVEFILE_REPLACE_EXISTING.
        if unsafe {
            windows_sys::Win32::Storage::FileSystem::MoveFileExW(a.as_ptr(), b.as_ptr(), 0)
        } == 0
        {
            return Err(std::io::Error::last_os_error().into());
        }
    }
    #[cfg(target_os = "linux")]
    {
        rustix::fs::renameat_with(
            rustix::fs::CWD,
            from,
            rustix::fs::CWD,
            to,
            rustix::fs::RenameFlags::NOREPLACE,
        )
        .map_err(std::io::Error::from)?;
    }
    #[cfg(target_os = "macos")]
    {
        use std::{ffi::CString, os::unix::ffi::OsStrExt};
        let a = CString::new(from.as_os_str().as_bytes())
            .map_err(|e| AppError::new("invalidName", e))?;
        let b =
            CString::new(to.as_os_str().as_bytes()).map_err(|e| AppError::new("invalidName", e))?;
        if unsafe { libc::renamex_np(a.as_ptr(), b.as_ptr(), libc::RENAME_EXCL) } != 0 {
            return Err(std::io::Error::last_os_error().into());
        }
    }
    #[cfg(not(any(windows, target_os = "linux", target_os = "macos")))]
    return Err(AppError::new("unsupportedPlatform", "rename"));
    Ok(())
}
pub fn valid_name(name: &str) -> bool {
    if name.is_empty() || name == "." || name == ".." || name.contains(['/', '\0']) {
        return false;
    }
    #[cfg(windows)]
    {
        if name.ends_with([' ', '.'])
            || name.chars().any(|c| c < ' ' || "<>:\"\\|?*".contains(c))
            || name.encode_utf16().count() > 255
        {
            return false;
        }
        let base = name
            .split('.')
            .next()
            .unwrap_or("")
            .trim_end()
            .to_uppercase();
        if ["CON", "PRN", "AUX", "NUL", "CONIN$", "CONOUT$"].contains(&base.as_str())
            || (base.starts_with("COM") || base.starts_with("LPT"))
                && ["1", "2", "3", "4", "5", "6", "7", "8", "9", "¹", "²", "³"]
                    .contains(&&base[3..])
        {
            return false;
        }
    }
    #[cfg(not(windows))]
    if name.len() > 255 {
        return false;
    }
    true
}

pub fn case_sensitivity(parent: &Path) -> Option<bool> {
    #[cfg(windows)]
    {
        use std::{
            fs::OpenOptions,
            os::windows::{fs::OpenOptionsExt, io::AsRawHandle},
        };
        use windows_sys::Win32::Storage::FileSystem::{
            FileCaseSensitiveInfo, GetFileInformationByHandleEx, FILE_CASE_SENSITIVE_INFO,
            FILE_FLAG_BACKUP_SEMANTICS,
        };
        let directory = OpenOptions::new()
            .read(true)
            .custom_flags(FILE_FLAG_BACKUP_SEMANTICS)
            .open(parent)
            .ok()?;
        let mut info = FILE_CASE_SENSITIVE_INFO { Flags: 0 };
        if unsafe {
            GetFileInformationByHandleEx(
                directory.as_raw_handle(),
                FileCaseSensitiveInfo,
                (&mut info as *mut FILE_CASE_SENSITIVE_INFO).cast(),
                std::mem::size_of_val(&info) as u32,
            )
        } != 0
        {
            return Some(info.Flags & 1 != 0);
        }
    }
    #[cfg(target_os = "macos")]
    {
        use std::{ffi::CString, os::unix::ffi::OsStrExt};
        #[repr(C)]
        struct VolumeInfo {
            length: u32,
            capabilities: libc::vol_capabilities_attr_t,
        }
        let path = CString::new(parent.as_os_str().as_bytes()).ok()?;
        let mut attributes: libc::attrlist = unsafe { std::mem::zeroed() };
        attributes.bitmapcount = libc::ATTR_BIT_MAP_COUNT;
        attributes.volattr = libc::ATTR_VOL_CAPABILITIES | libc::ATTR_VOL_INFO;
        let mut info: VolumeInfo = unsafe { std::mem::zeroed() };
        if unsafe {
            libc::getattrlist(
                path.as_ptr(),
                (&mut attributes as *mut libc::attrlist).cast(),
                (&mut info as *mut VolumeInfo).cast(),
                std::mem::size_of_val(&info),
                0,
            )
        } == 0
        {
            let mask = libc::VOL_CAP_FMT_CASE_SENSITIVE;
            if info.capabilities.valid[libc::VOL_CAPABILITIES_FORMAT] & mask != 0 {
                return Some(
                    info.capabilities.capabilities[libc::VOL_CAPABILITIES_FORMAT] & mask != 0,
                );
            }
        }
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    let _ = parent;
    None
}
