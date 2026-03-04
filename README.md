# BTerminal

Terminal z panelem sesji w stylu MobaXterm, zbudowany w GTK 3 + VTE. Catppuccin Mocha theme.

![BTerminal](screenshot.png)

## Funkcje

- **Sesje SSH** — zapisywane konfiguracje (host, port, user, klucz, folder, kolor), CRUD z panelem bocznym
- **Claude Code** — zapisywane konfiguracje Claude Code z opcjami sudo, resume, skip-permissions i initial prompt
- **Makra SSH** — wielokrokowe makra (text, key, delay) przypisane do sesji, uruchamiane z sidebara
- **Zakładki** — wiele terminali w tabach, Ctrl+T nowy, Ctrl+Shift+W zamknij, Ctrl+PageUp/Down przełączaj
- **Sudo askpass** — Claude Code z sudo: hasło podawane raz, tymczasowy askpass helper, automatyczne czyszczenie
- **Grupowanie folderami** — sesje SSH i Claude Code mogą być grupowane w foldery na sidebarze
- **Catppuccin Mocha** — pełny theme: terminal, sidebar, taby, kolory sesji

## Wymagania

```
python3 >= 3.8
python3-gi
gir1.2-gtk-3.0
gir1.2-vte-2.91
```

### Instalacja zależności (Debian/Ubuntu/Pop!_OS)

```bash
sudo apt install python3-gi gir1.2-gtk-3.0 gir1.2-vte-2.91
```

## Uruchomienie

```bash
python3 bterminal.py
```

## Konfiguracja

Pliki konfiguracyjne w `~/.config/bterminal/`:

| Plik | Opis |
|------|------|
| `sessions.json` | Zapisane sesje SSH + makra |
| `claude_sessions.json` | Zapisane konfiguracje Claude Code |

## Skróty klawiszowe

| Skrót | Akcja |
|-------|-------|
| `Ctrl+T` | Nowa zakładka (local shell) |
| `Ctrl+Shift+W` | Zamknij zakładkę |
| `Ctrl+Shift+C` | Kopiuj |
| `Ctrl+Shift+V` | Wklej |
| `Ctrl+PageUp/Down` | Poprzednia/następna zakładka |

## Licencja

MIT
