Set WshShell = CreateObject("WScript.Shell")
desktop = WshShell.SpecialFolders("Desktop")
Set Shortcut = WshShell.CreateShortcut(desktop & "\FinanceManager.lnk")
Shortcut.TargetPath = "d:\财务客户管理系统\index.html"
Shortcut.WorkingDirectory = "d:\财务客户管理系统"
Shortcut.Description = "小公司财务与客户管理系统"
Shortcut.Save
