English • [Русский](https://github.com/greetclammy/first-line-is-title/blob/main/README_RU.md)

# First Line is Title

Automatically set the first line as note title, just like in Apple Notes! Forget about manual file name entry or nondescript timestamps.

![](https://github.com/user-attachments/assets/eed638e0-f695-4fdd-a0a6-2ace66585d58)

> [!TIP]
> The plugin is best used with the tab title bar and/or inline title enabled in Obsidian settings > Appearance > Interface.

## Features

- Rename notes automatically or manually.
- Move cursor to first line on note creation.
- Put any first line content in title or headings only.
- Replace characters forbidden in file names with safe alternatives, or omit them entirely.
- Strip Markdown syntax from file names.
- Add custom replacement rules.
- Automatically populate first line alias property — make forbidden characters searchable in link suggester and Quick switcher, or set as note title in plugins like [Quick Switcher++](https://obsidian.md/plugins?id=darlal-switcher-plus), [Omnisearch](https://obsidian.md/plugins?id=omnisearch), [Notebook Navigator](https://obsidian.md/plugins?id=notebook-navigator) and [Front Matter Title](https://obsidian.md/plugins?id=obsidian-front-matter-title-plugin).
- Commands to batch rename all notes in folder, all notes with tag, all search results, or entire vault.
- Automatically insert file name in first line on note creation.
- Exclude select notes, folders, tags, properties or file names from renaming, or only enable renaming in some.
- Command to convert selection containing forbidden characters into valid internal link, with original text preserved in link caption.

## File integrity

- Only notes that are currently open in the editor are processed, along with any notes you explicitly select for batch operations (like renaming all notes in a folder).
- By default, note modification time is preserved on rename.
- Multiple safeguards are in place to prevent unintended changes but **regular [backups](https://help.obsidian.md/backup) remain your ultimate safety net**.

## Install

Untill _First Line is Title_ is [made availiable](https://github.com/obsidianmd/obsidian-releases/pull/7429) in the plugin directory, follow the steps below to install it.

### BRAT (recommended)

1. Download and enable the community plugin [BRAT](https://obsidian.md/plugins?id=obsidian42-brat).
2. Open _BRAT_ settings.
3. Press _Add Beta Plugin_.
4. Paste https://github.com/greetclammy/first-line-is-title in the text field.
5. Select _Latest version_.
6. Check _Enable after installing the plugin_.
7. Press _Add Plugin_.

### Install manually

Note: to get updates for _First Line is Title_, you will have to check for and install them manually.

1. Download `first-line-is-title.zip` in the `Assets` of the [latest release](https://github.com/greetclammy/first-line-is-title/releases).
2. Unzip the folder and place it in the `.obsidian/plugins` folder (hidden on most OSes) at the root of your vault.
3. Reload plugins or app.
4. Enable _First Line is Title_ in Obsidian settings > Community plugins > Installed plugins.

## Support

- Please [open an issue](https://github.com/greetclammy/dynamic-views/issues) if you run into any problems. 
- Feature requests considered but not prioritized; further development focused on stability. PRs welcome.
