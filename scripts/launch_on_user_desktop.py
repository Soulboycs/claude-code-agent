import ctypes
from ctypes import wintypes
import os

class STARTUPINFO(ctypes.Structure):
    _fields_ = [
        ('cb', wintypes.DWORD),
        ('lpReserved', wintypes.LPWSTR),
        ('lpDesktop', wintypes.LPWSTR),
        ('lpTitle', wintypes.LPWSTR),
        ('dwX', wintypes.DWORD),
        ('dwY', wintypes.DWORD),
        ('dwXSize', wintypes.DWORD),
        ('dwYSize', wintypes.DWORD),
        ('dwXCountChars', wintypes.DWORD),
        ('dwYCountChars', wintypes.DWORD),
        ('dwFillAttribute', wintypes.DWORD),
        ('dwFlags', wintypes.DWORD),
        ('wShowWindow', wintypes.WORD),
        ('cbReserved2', wintypes.WORD),
        ('lpReserved2', ctypes.POINTER(wintypes.BYTE)),
        ('hStdInput', wintypes.HANDLE),
        ('hStdOutput', wintypes.HANDLE),
        ('hStdError', wintypes.HANDLE),
    ]

class PROCESS_INFORMATION(ctypes.Structure):
    _fields_ = [
        ('hProcess', wintypes.HANDLE),
        ('hThread', wintypes.HANDLE),
        ('dwProcessId', wintypes.DWORD),
        ('dwThreadId', wintypes.DWORD),
    ]

si = STARTUPINFO()
si.cb = ctypes.sizeof(STARTUPINFO)
# Force execution on the user's interactive physical desktop!
si.lpDesktop = 'WinSta0\\default'

pi = PROCESS_INFORMATION()

cmd = r'C:\Windows\System32\cmd.exe /c D:\Agent\run_dev.bat > D:\Agent\bat_output.log 2>&1'

res = ctypes.windll.kernel32.CreateProcessW(
    None,
    cmd,
    None,
    None,
    False,
    0x00000010, # CREATE_NEW_CONSOLE
    None,
    r'D:\Agent',
    ctypes.byref(si),
    ctypes.byref(pi)
)

if res:
    print(f'Successfully launched Electron dev on user desktop (WinSta0\\default)! PID: {pi.dwProcessId}')
else:
    err = ctypes.windll.kernel32.GetLastError()
    print(f'Failed to launch: error code {err}')
