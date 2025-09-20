# First Line is Title

Automatically put the first line in note title. Just like in Apple Notes. Forget about manual filename entry or non-descript timestamps. 

<img src="https://github.com/user-attachments/assets/4d4bb0d5-aaa8-464a-9e00-eeb88f4235de" height="450">

**⚠️ Ensure your files are backed up before using this plugin.**

## ⚡ Features

- Replace forbidden characters with safe alternatives.
- Omit markdown syntax in filename.
- Auto truncate long filenames.
- Add custom replacemet rules.
- Rename automatically or manually.
- Copy first line to `aliases` to make forbidden characters searchable in the Quick switcher.
- Commands to process entire folder, all notes with a certain tag, or all notes in vault in one go.
- Granular control: exclude certain notes, folders, tags or filenames from renaming.

## ✅ Installation

Untill _First Line is Title_ is made availiable in the plugin directory, follow the steps below to install it.

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
4. Enable _First Line is Title_ in `Settings > Community plugins > Installed plugins`.

## 💡 Tips

### New note template

It's recommended to use this plugin with a new note template that puts the cursor in note body on note creation, configured in [Templater](https://obsidian.md/plugins?id=templater-obsidian) settings.

An example template you can use:

<details>
  <summary><b>Press to expand</b></summary>

  ```js
---
created: <% moment(tp.file.creation_date()).format("YYYY-MM-DDTHH:mmZ") %>
tags: []
---
<%*
if (!(/^Untitled(\s\d+)?$/.test(tp.file.title))) {
-%>
<% tp.file.title %><% await tp.file.cursor() %><%*
} -%>
<%*
tp.hooks.on_all_templates_executed(async () => {
  const leaf = app.workspace.activeLeaf;
  if (leaf && leaf.view.getViewType() !== "canvas") {
    leaf.setViewState({
      type: "markdown",
      state: {
        mode: "source",
        source: false
      }
    });
    await leaf.view.editor?.focus();
  }
});
-%>
```
  
</details>

### Commands

The plugin adds three Command palette commmands:

<img width="489" height="230" src="https://github.com/user-attachments/assets/823c2510-77c5-4b49-8715-1f8e3477640f" />

For when you want to force the plugin to update the title, you could create a macro like this with [Commander](https://obsidian.md/plugins?id=cmdr) and bind it to Ctrl/Cmd-S:

<details>
  <summary><b>Press to expand</b></summary>
<img width="571" height="427" src="https://github.com/user-attachments/assets/24273438-d0e4-47a5-833c-f86161fa2b20" />
</details>

This is super useful if you already use Ctrl/Cmd-S to trigger [Linter](https://obsidian.md/plugins?id=obsidian-linter).

## ⭐️ Support

- [Report bugs](https://github.com/greetclammy/first-line-is-title/issues)
- [Request features](https://github.com/greetclammy/first-line-is-title/issues)
- [Contribute improvements](https://github.com/greetclammy/first-line-is-title/pulls)
- Share your thoughts on [Obsidian Forum](https://forum.obsidian.md/t/plugin-to-automatically-copy-first-line-in-note-to-note-title/103558), [Obsidian Members Group](https://discord.com/channels/686053708261228577/707816848615407697) or [GitHub discussions](https://github.com/greetclammy/first-line-is-title/discussions)

If you find this plugin helpful, please star the repository 😇

## 👀 Alternative solutions

- [Auto Filename](https://obsidian.md/plugins?id=auto-filename)
- [File Title Updater](https://obsidian.md/plugins?id=file-title-updater)
- [Filename Heading Sync](https://obsidian.md/plugins?id=obsidian-filename-heading-sync)

## 🙏 Acknowledgements

This plugin builds on [Auto Filename](https://obsidian.md/plugins?id=auto-filename) and employs some of its code.

## 👨‍💻 What else I made

- [Adapt to Current View](https://github.com/greetclammy/adapt-to-current-view/)
