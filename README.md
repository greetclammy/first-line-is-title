# First Line is Title

This custom plugin for [Obsidian](https://obsidian.md/) dynamically copies the first line in note body to note title.

- **It's recommended that you back up your files before using this plugin.**
- I don't yet plan on submiting this plugin to the Obsidian plugin gallery.
- This is an improved version of the [Auto Filename](https://github.com/rcsaquino/obsidian-auto-filename) plugin. 

## ▶️ Demo

https://github.com/user-attachments/assets/31c57879-eff3-4615-b358-83b12c97ecb4

## ⚙️ Settings page overview

<details>
  <summary>Screenshot</summary>
<img width="1044" height="1315" alt="settings" src="https://github.com/user-attachments/assets/02798b46-17a3-48c7-8d9f-64298a743d63" />
</details>

## ✅ Installation

1. Install the community plugin [BRAT](https://obsidian.md/plugins?id=obsidian42-brat).
2. Go to the BRAT settings.
3. Press "Add Beta Plugin".
3. Paste the following URL in the text field: https://github.com/greetclammy/first-line-is-title.
4. Select the latest release.
5. Make sure that "Enable after installing the plugin" is checked.
6. Press "Add Plugin".

## 📝 New note template

It's recommended to use this plugin with a new note template that puts the cursor in note body on note creation, configured in [Templater](https://github.com/SilentVoid13/Templater) settings.

Here's the template that I use:

<details>
  <summary>Templater script</summary>

  ```js
---
created: <% moment(tp.file.creation_date()).format("YYYY-MM-DDTHH:mmZ") %>
tags: []
---
<%* 
if (!(/^Untitled(\s\d+)?$/.test(tp.file.title))) { -%>
<% tp.file.title %><% await tp.file.cursor() %>
<%* } -%>
<%*
tp.hooks.on_all_templates_executed(async () => {
  const leaf = app.workspace.activeLeaf;
  leaf.setViewState({
    type: "markdown",
    state: {
      mode: "source", 
      source: false
    }
  });
  await leaf.view.editor.focus();
});
-%>
```
  
</details>

## 💡 Room for improvement

Though I don't currently plan on working on this plugin further, a few potential improvements come to mind:

1. Opiton to omit markdown syntax in title.
2. Two-way-sync: also sync title → first line.
3. Create custom CSS to make replacements for illegal characters appear the same as illegal characters—anywhere you can come across a note title.
4. Extend the illegal character mapping functionality to vault search and the Quick switcher.
   - For example, if `:` (regular colon) is replaced by `։` (replacement character) in file names, searching for `:` (regular) in vault search or the Quick switcher should automatically map to and match `։` (alt).
6. Add option to disable renaming file or folder in file and folder context menu.
7. Add option to rename file every time it gets opened (even if not focused).
   - Currently, if "Rename on focus" is toggled ON, the file gets renamed when it gets focused, not when it gets opened. E.g. if you open a file in a new tab without switching to it (if such option is enabled in Obsidian settings > Editor).
8. Replace the "Remove" button with the Lucide trash icon.
9. Replace "Restore defaults" with [rotate-ccw](https://lucide.dev/icons/rotate-ccw) icon for each option.

## 👀 Alternative solutions

1. [Auto Filename](https://github.com/rcsaquino/obsidian-auto-filename)
2. [File Title Updater](https://github.com/wenlzhang/obsidian-file-title-updater)
3. [Obsidian Filename Heading Sync](https://github.com/dvcrn/obsidian-filename-heading-sync)

## 💬 Discuss

Feel free to share your thoughts about this plugin on:

- [The Obsidian Forum](https://forum.obsidian.md/t/plugin-to-automatically-copy-first-line-in-note-to-note-title/103558)
- [The Obsidian Members Group (OMG) Discord channel](https://discord.com/channels/686053708261228577/707816848615407697)
- [GitHub discussions](https://github.com/greetclammy/first-line-is-title/discussions)

Please ⭐️ this repository if you found the plugin helpful 😇
