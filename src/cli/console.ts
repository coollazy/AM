// Windows 終端機預設使用系統字碼頁（例如繁中的 950），先切換成 UTF-8 以正確顯示中文
export function useUtf8Console(): void {
  if (process.platform !== "win32") return;
  try {
    const { dlopen, FFIType } = require("bun:ffi") as typeof import("bun:ffi");
    const kernel32 = dlopen("kernel32.dll", {
      SetConsoleOutputCP: { args: [FFIType.u32], returns: FFIType.i32 },
      SetConsoleCP: { args: [FFIType.u32], returns: FFIType.i32 },
    });
    kernel32.symbols.SetConsoleOutputCP(65001);
    kernel32.symbols.SetConsoleCP(65001);
  } catch {
    // 切換失敗時維持原狀，不影響其他功能
  }
}
