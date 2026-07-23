# Helix Code

Helix Code is a Windows desktop coding workspace with an AI agent, project explorer, Monaco editor, and support for cloud and local models.

Version: v1.0 BETA

Repository: https://github.com/neonatro/helixcode

Made by neonatro

## Run the installer

Download and run the Helix Code Setup EXE. It installs Helix Code for the current Windows user and creates normal shortcuts.

When Helix Code opens for the first time, choose a provider or skip setup and configure one later in Settings.

Your API keys, chats, cache, and workspace history are stored separately for each Windows user. They are not included in the installer.

## Run from source

Install Node.js 20 or newer, open a terminal in the project folder, and run:

```powershell
npm.cmd install
npm.cmd run dev
```

If your copy of the project is still named `Helix-Agent`, rename it before opening a new terminal:

```powershell
Rename-Item "C:\Users\noelc\OneDrive\Desktop\Helix-Agent" "helixcode"
```

Then run it from the renamed folder:

```powershell
Set-Location "C:\Users\noelc\OneDrive\Desktop\helixcode"
npm.cmd run dev
```

## Features

- AI providers: OpenRouter, Gemini, Groq, OpenAI, Anthropic, Ollama, LM Studio, and compatible OpenAI-style APIs.
- Model loading from the selected provider, with free model labels and search where available.
- Persistent chats, model switching in chat, stop controls, and visible model changes.
- Optional web research for requests that need current information, online assets, or URLs.
- Expandable model thinking when the selected provider returns reasoning.
- Project Explorer with file icons, create, rename, delete, multi-select, right-click actions, and remembered folders.
- Monaco code editor with tabs and file-change previews.
- Project mode keeps agent file work inside the folder you opened.
- Commands and deletions require approval. Extended mode is optional and disabled by default.
- Resizable Explorer and chat panes with a dark Helix Code interface.

## Local data

Helix Code keeps local settings in this Windows folder:

```text
C:\Users\<username>\AppData\Roaming\helix-code
```

This includes encrypted API-key material when Windows encryption is available, chat history, settings, remembered folders, and Electron cache files. Delete that folder to reset Helix Code completely.

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Do not commit API keys, chat history, Windows AppData files, or other personal information.

## License

Copyright 2026 neonatro.

Helix Code uses the [PolyForm Noncommercial License 1.0.0](LICENSE.md). It allows non-commercial use, modification, distribution, and contributions. Commercial use is not allowed.

