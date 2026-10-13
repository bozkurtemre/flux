// What Flux itself costs the Mac, for the status bar: its CPU and its memory, as shares of the
// whole machine. Flux is more than this process: the webview runs in WebKit's own processes and
// the terminals in their shells, and macOS holds Flux responsible for all of them — the same
// attribution Activity Monitor uses — so every process Flux is responsible for is counted.
// Memory is each one's physical footprint, as Activity Monitor's Memory column shows it.
use serde::Serialize;
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Instant;

#[derive(Serialize, Default)]
pub struct Usage {
    /// Of all the cores together, 0–100.
    cpu: f64,
    /// Of the Mac's physical memory, 0–100.
    memory: f64,
    memory_bytes: u64,
}

/// The CPU time each process had at the last reading, and when that was.
static LAST: Mutex<Option<(Instant, HashMap<i32, u64>)>> = Mutex::new(None);

#[tauri::command]
pub fn usage_read() -> Usage {
    #[cfg(target_os = "macos")]
    return mac::read();
    #[cfg(not(target_os = "macos"))]
    Usage::default()
}

#[cfg(target_os = "macos")]
mod mac {
    use super::{Usage, LAST};
    use std::collections::HashMap;
    use std::ffi::{c_int, c_void};
    use std::time::Instant;

    // the parts of <sys/resource.h> and <libproc.h> used, as the headers lay them out
    #[repr(C)]
    #[derive(Default)]
    struct RusageInfoV2 {
        uuid: [u8; 16],
        user_time: u64,
        system_time: u64,
        pkg_idle_wkups: u64,
        interrupt_wkups: u64,
        pageins: u64,
        wired_size: u64,
        resident_size: u64,
        phys_footprint: u64,
        rest: [u64; 10],
    }

    #[repr(C)]
    #[derive(Default)]
    struct Timebase {
        numer: u32,
        denom: u32,
    }

    extern "C" {
        fn proc_listallpids(buffer: *mut c_void, size: c_int) -> c_int;
        fn proc_pid_rusage(pid: c_int, flavor: c_int, buffer: *mut RusageInfoV2) -> c_int;
        // private but stable since 10.14, and what Activity Monitor groups by
        fn responsibility_get_pid_responsible_for_pid(pid: c_int) -> c_int;
        fn mach_timebase_info(info: *mut Timebase) -> c_int;
        fn sysctlbyname(
            name: *const i8,
            old: *mut c_void,
            oldlen: *mut usize,
            new: *mut c_void,
            newlen: usize,
        ) -> c_int;
    }

    const RUSAGE_INFO_V2: c_int = 2;

    fn sysctl_u64(name: &str) -> u64 {
        let name = std::ffi::CString::new(name).unwrap();
        let mut value: u64 = 0;
        let mut len = std::mem::size_of::<u64>();
        // SAFETY: the buffer is a u64 and its length is passed with it
        unsafe {
            sysctlbyname(
                name.as_ptr(),
                &mut value as *mut u64 as *mut c_void,
                &mut len,
                std::ptr::null_mut(),
                0,
            )
        };
        if len == 4 {
            value & 0xffff_ffff
        } else {
            value
        }
    }

    /// Every process Flux answers for: itself, its WebKit processes, its shells.
    fn ours() -> Vec<c_int> {
        let me = std::process::id() as c_int;
        let mut pids = vec![0 as c_int; 8192];
        // SAFETY: the buffer's size in bytes is passed with it
        let n = unsafe {
            proc_listallpids(pids.as_mut_ptr() as *mut c_void, (pids.len() * 4) as c_int)
        };
        pids.truncate(n.max(0) as usize);
        // SAFETY: a lookup by pid, no memory handed over
        pids.into_iter()
            .filter(|&p| {
                p > 0 && (p == me || unsafe { responsibility_get_pid_responsible_for_pid(p) } == me)
            })
            .collect()
    }

    pub fn read() -> Usage {
        let mut tb = Timebase::default();
        // SAFETY: fills the struct passed
        unsafe { mach_timebase_info(&mut tb) };
        let to_ns = |t: u64| t as u128 * tb.numer.max(1) as u128 / tb.denom.max(1) as u128;

        let mut cpu_now = HashMap::new();
        let mut footprint = 0u64;
        for pid in ours() {
            let mut info = RusageInfoV2::default();
            // SAFETY: the buffer is the v2 struct the flavour asks for
            if unsafe { proc_pid_rusage(pid, RUSAGE_INFO_V2, &mut info) } != 0 {
                continue;
            }
            footprint += info.phys_footprint;
            cpu_now.insert(pid, to_ns(info.user_time + info.system_time) as u64);
        }

        let now = Instant::now();
        let mut last = LAST.lock().unwrap();
        // CPU is time used between two readings; the first reading has nothing to compare with
        let cpu = match last.as_ref() {
            Some((then, before)) => {
                let wall = now.duration_since(*then).as_nanos().max(1) as f64;
                let used: u64 = cpu_now
                    .iter()
                    .map(|(pid, t)| t.saturating_sub(*before.get(pid).unwrap_or(t)))
                    .sum();
                let cores = sysctl_u64("hw.logicalcpu").max(1) as f64;
                (used as f64 / wall / cores * 100.0).clamp(0.0, 100.0)
            }
            None => 0.0,
        };
        *last = Some((now, cpu_now));

        let total = sysctl_u64("hw.memsize").max(1);
        Usage {
            cpu,
            memory: footprint as f64 / total as f64 * 100.0,
            memory_bytes: footprint,
        }
    }
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    #[test]
    fn reads_this_process() {
        super::usage_read();
        let mut spin = 0u64;
        for i in 0..20_000_000u64 {
            spin = spin.wrapping_add(i * i);
        }
        std::hint::black_box(spin);
        let u = super::usage_read();
        assert!(u.memory_bytes > 0 && u.memory > 0.0 && u.memory < 100.0);
        assert!(u.cpu > 0.0 && u.cpu <= 100.0, "cpu {}", u.cpu);
    }
}
