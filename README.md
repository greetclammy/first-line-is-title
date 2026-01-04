English • [Русский](https://github.com/greetclammy/first-line-is-title/blob/main/README_RU.md)

# First Line is Title

Automatically set the first line as note title, just like in Apple Notes! Forget about manual file name entry or nondescript timestamps.

![](https://github.com/user-attachments/assets/eed638e0-f695-4fdd-a0a6-2ace66585d58)

> [!TIP]
> The plugin is best used with the tab title bar and/or inline title enabled in Obsidian settings > Appearance > Interface.

## Key features

- Rename notes automatically or manually.
- Move cursor to first line on note creation.
- Put any first line content in title or headings only.
- Replace characters forbidden in file names with safe alternatives, or omit them entirely.
- Strip Markdown syntax from file names.
- Add custom replacement rules.
- Automatically populate first line alias property — make forbidden characters searchable in Quick switcher and link suggester, or set as note title in plugins like [Quick Switcher++](https://obsidian.md/plugins?id=darlal-switcher-plus), [Omnisearch](https://obsidian.md/plugins?id=omnisearch), [Notebook Navigator](https://obsidian.md/plugins?id=notebook-navigator) and [Front Matter Title](https://obsidian.md/plugins?id=obsidian-front-matter-title-plugin).
- Commands to batch rename all notes in folder, all notes with tag, all search results, or entire vault.
- Automatically insert file name in first line on note creation.
- Exclude select notes, folders, tags, properties or file names from renaming, or only enable renaming in some.
- Command to convert selection containing forbidden characters into valid internal link, with original text preserved in link caption.

## File integrity

- Only notes that are currently open in the editor are processed, along with any notes you explicitly select for batch operations (like renaming all notes in a folder).
- By default, note modification time is preserved on rename.
- Multiple safeguards are in place to prevent unintended changes but **regular [backups](https://help.obsidian.md/backup) remain your ultimate safety net**.

## Install

Until _First Line is Title_ is [made available](https://github.com/obsidianmd/obsidian-releases/pull/8400) in the plugin directory, follow the steps below to install it:

1. Download and enable the community plugin [BRAT](https://obsidian.md/plugins?id=obsidian42-brat).
2. Run _Add a beta plugin for testing_ in Command palette.
3. Paste https://github.com/greetclammy/first-line-is-title in the text field.
4. Select _Latest version_.
5. Check _Enable after installing the plugin_.
6. Press _Add Plugin_.

<details><summary>Install manually</summary>

Note: to get updates for _First Line is Title_, you will have to check for and install them manually.

1. Download `first-line-is-title.zip` in the `Assets` of the [latest release](https://github.com/greetclammy/first-line-is-title/releases).
2. Unzip the folder and place it in the `.obsidian/plugins` folder (hidden on most OSes) at the root of your vault.
3. Reload plugins or app.
4. Enable _First Line is Title_ in Obsidian settings > Community plugins > Installed plugins.

</details>

## Commands

### Ribbon

| | Command | Description |
|:---:|---------|-------------|
| <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.659 22H18a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v9.34"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M10.378 12.622a1 1 0 0 1 3 3.003L8.36 20.637a2 2 0 0 1-.854.506l-2.867.837a.5.5 0 0 1-.62-.62l.836-2.869a2 2 0 0 1 .506-.853z"/></svg> | Put first line in title | Rename active note, even if in excluded folder or with excluded tag or property. |
| <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2h-4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8"/><path d="M16.706 2.706A2.4 2.4 0 0 0 15 2v5a1 1 0 0 0 1 1h5a2.4 2.4 0 0 0-.706-1.706z"/><path d="M5 7a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h8a2 2 0 0 0 1.732-1"/></svg> | Put first line in title in all notes | Rename all notes in vault except if in excluded folder or with excluded tag or property. |
| <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13.85 22H18a2 2 0 0 0 2-2V8a2 2 0 0 0-.586-1.414l-4-4A2 2 0 0 0 14 2H6a2 2 0 0 0-2 2v6.6"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="m3.305 19.53.923-.382"/><path d="m4.228 16.852-.924-.383"/><path d="m5.852 15.228-.383-.923"/><path d="m5.852 20.772-.383.924"/><path d="m8.148 15.228.383-.923"/><path d="m8.53 21.696-.382-.924"/><path d="m9.773 16.852.922-.383"/><path d="m9.773 19.148.922.383"/><circle cx="7" cy="18" r="3"/></svg> | Toggle automatic renaming | Toggle the *Rename notes* setting between *Automatically* and *Manually*. |

### Command palette

| | Command | Description |
|:---:|---------|-------------|
| <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.659 22H18a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v9.34"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M10.378 12.622a1 1 0 0 1 3 3.003L8.36 20.637a2 2 0 0 1-.854.506l-2.867.837a.5.5 0 0 1-.62-.62l.836-2.869a2 2 0 0 1 .506-.853z"/></svg> | Put first line in title | Rename active note, even if in excluded folder or with excluded tag or property. |
| <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.659 22H18a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v9.34"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M10.378 12.622a1 1 0 0 1 3 3.003L8.36 20.637a2 2 0 0 1-.854.506l-2.867.837a.5.5 0 0 1-.62-.62l.836-2.869a2 2 0 0 1 .506-.853z"/></svg> | Put first line in title (unless excluded) | Rename active note except if in excluded folder or with excluded tag or property. |
| <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 21a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1"/><path d="M16 16a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1"/><path d="M21 6a2 2 0 0 0-.586-1.414l-2-2A2 2 0 0 0 17 2h-3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1z"/></svg> | Put first line in title in all notes | Rename all notes in vault except if in excluded folder or with excluded tag or property. |
| <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13.85 22H18a2 2 0 0 0 2-2V8a2 2 0 0 0-.586-1.414l-4-4A2 2 0 0 0 14 2H6a2 2 0 0 0-2 2v6.6"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="m3.305 19.53.923-.382"/><path d="m4.228 16.852-.924-.383"/><path d="m5.852 15.228-.383-.923"/><path d="m5.852 20.772-.383.924"/><path d="m8.148 15.228.383-.923"/><path d="m8.53 21.696-.382-.924"/><path d="m9.773 16.852.922-.383"/><path d="m9.773 19.148.922.383"/><circle cx="7" cy="18" r="3"/></svg> | Toggle automatic renaming | Toggle the *Rename notes* setting between *Automatically* and *Manually*. |
| <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg> | Disable renaming for note | Exclude active note from renaming. |
| <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="m9 12 2 2 4-4"/></svg> | Enable renaming for note | Stop excluding active note from renaming. |
| <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg> | Add safe internal link | Create internal link with forbidden characters handled as set in *Replace characters*. |
| <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg> | Add safe internal link with caption | Create internal link with forbidden characters handled as set in *Replace characters*, and with original text in caption. |
| <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg> | Add internal link with caption and custom target | Create internal link with selected text in caption. Set link path manually. |
| <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12v-1h6v1"/><path d="M11 17h2"/><path d="M12 11v6"/></svg> | Insert file name at cursor position | Insert current file name at cursor position. Convert forbidden character replacements back to their original forms, as set in *Replace characters*. |

## Support

- Please [open an issue](https://github.com/greetclammy/first-line-is-title/issues) if you run into any problems. 
- Feature requests considered but not prioritized; further development focused on stability. PRs welcome.
