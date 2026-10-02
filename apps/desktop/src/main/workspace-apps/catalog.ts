// Adapted from DeepSeek Harness 639ed01539. See LICENSE in this directory.
export type Launch = { kind: 'shell-open' } | { kind: 'argv'; command: string; args: readonly string[]; env?: Record<string,string>; windowsHide?: boolean };
export type Locator =
 | { kind: 'fixed'; launch: Launch; iconPath: string }
 | { kind: 'app'; fsNames: readonly string[] }
 | { kind: 'xcode' }
 | { kind: 'cli'; name: string; args: readonly string[] }
 | { kind: 'file'; candidates: readonly string[]; args: readonly string[] }
 | { kind: 'scan'; root: string; namePrefix: string; relativeLauncher: string; args: readonly string[] }
 | { kind: 'app-paths'; exe: string; args: readonly string[] }
 | { kind: 'install-record'; displayNamePrefix: string; relativeLauncher?: string; args: readonly string[] }
 | { kind: 'github-desktop'; root: string };
export interface CatalogApp { id: string; name: string; platforms: Partial<Record<'darwin'|'win32',{locators: readonly Locator[]}>> }
export const catalog: readonly CatalogApp[] = [
  {"id":"finder","name":"Finder","platforms":{"darwin":{"locators":[{"kind":"fixed","launch":{"kind":"shell-open"},"iconPath":"/System/Library/CoreServices/Finder.app"}]}}},
  {"id":"explorer","name":"File Explorer","platforms":{"win32":{"locators":[{"kind":"fixed","launch":{"kind":"shell-open"},"iconPath":"${SystemRoot}/explorer.exe"}]}}},
  {"id":"cursor","name":"Cursor","platforms":{"darwin":{"locators":[{"kind":"app","fsNames":["Cursor.app"]}]},"win32":{"locators":[{"kind":"app-paths","exe":"Cursor.exe","args":[]},{"kind":"install-record","displayNamePrefix":"Cursor","args":[]},{"kind":"file","candidates":["${LOCALAPPDATA}/Programs/cursor/Cursor.exe"],"args":[]}]}}},
  {"id":"vscode","name":"VS Code","platforms":{"darwin":{"locators":[{"kind":"app","fsNames":["Visual Studio Code.app"]}]},"win32":{"locators":[{"kind":"app-paths","exe":"Code.exe","args":[]},{"kind":"install-record","displayNamePrefix":"Microsoft Visual Studio Code","relativeLauncher":"Code.exe","args":[]},{"kind":"file","candidates":["${LOCALAPPDATA}/Programs/Microsoft VS Code/Code.exe","${ProgramFiles}/Microsoft VS Code/Code.exe"],"args":[]}]}}},
  {"id":"vscodeinsiders","name":"VS Code Insiders","platforms":{"darwin":{"locators":[{"kind":"app","fsNames":["Visual Studio Code - Insiders.app"]}]},"win32":{"locators":[{"kind":"app-paths","exe":"Code - Insiders.exe","args":[]},{"kind":"install-record","displayNamePrefix":"Microsoft Visual Studio Code Insiders","relativeLauncher":"Code - Insiders.exe","args":[]},{"kind":"file","candidates":["${LOCALAPPDATA}/Programs/Microsoft VS Code Insiders/Code - Insiders.exe"],"args":[]}]}}},
  {"id":"windsurf","name":"Windsurf","platforms":{"darwin":{"locators":[{"kind":"app","fsNames":["Windsurf.app"]}]},"win32":{"locators":[{"kind":"app-paths","exe":"Windsurf.exe","args":[]},{"kind":"install-record","displayNamePrefix":"Windsurf","args":[]},{"kind":"file","candidates":["${LOCALAPPDATA}/Programs/Windsurf/Windsurf.exe"],"args":[]}]}}},
  {"id":"zed","name":"Zed","platforms":{"darwin":{"locators":[{"kind":"app","fsNames":["Zed.app","Zed Preview.app"]}]}}},
  {"id":"sublimetext","name":"Sublime Text","platforms":{"darwin":{"locators":[{"kind":"app","fsNames":["Sublime Text.app"]}]},"win32":{"locators":[{"kind":"app-paths","exe":"sublime_text.exe","args":[]},{"kind":"install-record","displayNamePrefix":"Sublime Text","args":[]},{"kind":"file","candidates":["${ProgramFiles}/Sublime Text/sublime_text.exe"],"args":[]}]}}},
  {"id":"xcode","name":"Xcode","platforms":{"darwin":{"locators":[{"kind":"xcode"}]}}},
  {"id":"androidstudio","name":"Android Studio","platforms":{"darwin":{"locators":[{"kind":"app","fsNames":["Android Studio.app"]}]},"win32":{"locators":[{"kind":"install-record","displayNamePrefix":"Android Studio","relativeLauncher":"bin/studio64.exe","args":[]},{"kind":"file","candidates":["${ProgramFiles}/Android/Android Studio/bin/studio64.exe"],"args":[]}]}}},
  {"id":"intellij","name":"IntelliJ IDEA","platforms":{"darwin":{"locators":[{"kind":"app","fsNames":["IntelliJ IDEA.app","IntelliJ IDEA Ultimate.app","IntelliJ IDEA CE.app"]}]},"win32":{"locators":[{"kind":"scan","root":"${ProgramFiles}/JetBrains","namePrefix":"IntelliJ IDEA","relativeLauncher":"bin/idea64.exe","args":[]},{"kind":"install-record","displayNamePrefix":"IntelliJ IDEA","relativeLauncher":"bin/idea64.exe","args":[]}]}}},
  {"id":"pycharm","name":"PyCharm","platforms":{"darwin":{"locators":[{"kind":"app","fsNames":["PyCharm.app","PyCharm Professional.app","PyCharm CE.app","PyCharm Community.app"]}]},"win32":{"locators":[{"kind":"scan","root":"${ProgramFiles}/JetBrains","namePrefix":"PyCharm","relativeLauncher":"bin/pycharm64.exe","args":[]},{"kind":"install-record","displayNamePrefix":"PyCharm","relativeLauncher":"bin/pycharm64.exe","args":[]}]}}},
  {"id":"webstorm","name":"WebStorm","platforms":{"darwin":{"locators":[{"kind":"app","fsNames":["WebStorm.app"]}]},"win32":{"locators":[{"kind":"scan","root":"${ProgramFiles}/JetBrains","namePrefix":"WebStorm","relativeLauncher":"bin/webstorm64.exe","args":[]},{"kind":"install-record","displayNamePrefix":"WebStorm","relativeLauncher":"bin/webstorm64.exe","args":[]}]}}},
  {"id":"phpstorm","name":"PhpStorm","platforms":{"darwin":{"locators":[{"kind":"app","fsNames":["PhpStorm.app"]}]},"win32":{"locators":[{"kind":"scan","root":"${ProgramFiles}/JetBrains","namePrefix":"PhpStorm","relativeLauncher":"bin/phpstorm64.exe","args":[]},{"kind":"install-record","displayNamePrefix":"PhpStorm","relativeLauncher":"bin/phpstorm64.exe","args":[]}]}}},
  {"id":"goland","name":"GoLand","platforms":{"darwin":{"locators":[{"kind":"app","fsNames":["GoLand.app"]}]},"win32":{"locators":[{"kind":"scan","root":"${ProgramFiles}/JetBrains","namePrefix":"GoLand","relativeLauncher":"bin/goland64.exe","args":[]},{"kind":"install-record","displayNamePrefix":"GoLand","relativeLauncher":"bin/goland64.exe","args":[]}]}}},
  {"id":"rider","name":"Rider","platforms":{"darwin":{"locators":[{"kind":"app","fsNames":["Rider.app","JetBrains Rider.app"]}]},"win32":{"locators":[{"kind":"scan","root":"${ProgramFiles}/JetBrains","namePrefix":"Rider","relativeLauncher":"bin/rider64.exe","args":[]},{"kind":"install-record","displayNamePrefix":"Rider","relativeLauncher":"bin/rider64.exe","args":[]}]}}},
  {"id":"rustrover","name":"RustRover","platforms":{"darwin":{"locators":[{"kind":"app","fsNames":["RustRover.app"]}]},"win32":{"locators":[{"kind":"scan","root":"${ProgramFiles}/JetBrains","namePrefix":"RustRover","relativeLauncher":"bin/rustrover64.exe","args":[]},{"kind":"install-record","displayNamePrefix":"RustRover","relativeLauncher":"bin/rustrover64.exe","args":[]}]}}},
  {"id":"fork","name":"Fork","platforms":{"darwin":{"locators":[{"kind":"app","fsNames":["Fork.app"]}]},"win32":{"locators":[{"kind":"install-record","displayNamePrefix":"Fork","args":[]},{"kind":"file","candidates":["${LOCALAPPDATA}/Fork/Fork.exe"],"args":[]}]}}},
  {"id":"sourcetree","name":"Sourcetree","platforms":{"darwin":{"locators":[{"kind":"app","fsNames":["Sourcetree.app"]}]}}},
  {"id":"github","name":"GitHub Desktop","platforms":{"darwin":{"locators":[{"kind":"app","fsNames":["GitHub Desktop.app"]}]},"win32":{"locators":[{"kind":"github-desktop","root":"${LOCALAPPDATA}/GitHubDesktop"}]}}},
  {"id":"tower","name":"Tower","platforms":{"darwin":{"locators":[{"kind":"app","fsNames":["Tower.app"]}]}}},
  {"id":"gitkraken","name":"GitKraken","platforms":{"darwin":{"locators":[{"kind":"app","fsNames":["GitKraken.app"]}]}}},
  {"id":"smartgit","name":"SmartGit","platforms":{"darwin":{"locators":[{"kind":"app","fsNames":["SmartGit.app"]}]}}},
  {"id":"sublimemerge","name":"Sublime Merge","platforms":{"darwin":{"locators":[{"kind":"app","fsNames":["Sublime Merge.app"]}]},"win32":{"locators":[{"kind":"app-paths","exe":"sublime_merge.exe","args":[]},{"kind":"install-record","displayNamePrefix":"Sublime Merge","args":[]},{"kind":"file","candidates":["${ProgramFiles}/Sublime Merge/sublime_merge.exe"],"args":[]}]}}},
  {"id":"ghostty","name":"Ghostty","platforms":{"darwin":{"locators":[{"kind":"app","fsNames":["Ghostty.app"]}]}}},
  {"id":"warp","name":"Warp","platforms":{"darwin":{"locators":[{"kind":"app","fsNames":["Warp.app"]}]}}},
  {"id":"iterm","name":"iTerm2","platforms":{"darwin":{"locators":[{"kind":"app","fsNames":["iTerm.app"]}]}}},
  {"id":"kitty","name":"kitty","platforms":{"darwin":{"locators":[{"kind":"app","fsNames":["kitty.app"]}]}}},
  {"id":"terminal","name":"Terminal","platforms":{"darwin":{"locators":[{"kind":"fixed","launch":{"kind":"argv","command":"open","args":["-a","Terminal"]},"iconPath":"/System/Applications/Utilities/Terminal.app"}]}}},
  {"id":"windowsterminal","name":"Windows Terminal","platforms":{"win32":{"locators":[{"kind":"cli","name":"wt","args":["-d"]}]}}},
  {"id":"gitbash","name":"Git Bash","platforms":{"win32":{"locators":[{"kind":"install-record","displayNamePrefix":"Git version","relativeLauncher":"git-bash.exe","args":["--cd={path}"]},{"kind":"file","candidates":["${ProgramFiles}/Git/git-bash.exe"],"args":["--cd={path}"]}]}}},
];
