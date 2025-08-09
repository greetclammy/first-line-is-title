# First Line is Title

Dynamically copies the first line in note body to note title.

**⚠️ It's recommended that you back up your files before using this plugin.**

## ▶️ Demo

https://github.com/user-attachments/assets/31c57879-eff3-4615-b358-83b12c97ecb4

## ⚙️ Settings page overview

<details>
  <summary>Screenshot</summary>
<img width="1044" height="1315" alt="settings" src="https://github.com/user-attachments/assets/02798b46-17a3-48c7-8d9f-64298a743d63" />
</details>

## ✅ Installation

Untill this plugin is made availiable in the plugin gallery, it can be insalled via the community plugin [BRAT](https://obsidian.md/plugins?id=obsidian42-brat):

1. Open BRAT settings.
2. Press "Add Beta Plugin".
3. Paste this URL in the text field: https://github.com/greetclammy/first-line-is-title.
4. Select the latest release.
5. Check "Enable after installing the plugin".
6. Press "Add Plugin".

## 💡 Tips

### New note template

It's recommended to use this plugin with a new note template that puts the cursor in note body on note creation, configured in [Templater](https://obsidian.md/plugins?id=templater-obsidian) settings.

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
<% tp.file.title %><%* 
  const leaf = app.workspace.activeLeaf;
  if (leaf && leaf.view.getViewType() !== "canvas") { 
    await tp.file.cursor();
  }
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

This plugin adds two commmands to the Command palette:

<img width="732" height="200" alt="Screenshot 2025-08-04 at 15 16 40" src="https://github.com/user-attachments/assets/934db3a9-31fe-4ce6-826a-13b51e1ce6e6" />

For the times when you want to force the plugin to update the title, I recommend to create the following macro with [Commander](https://obsidian.md/plugins?id=cmdr) and bind it to Ctrl/Cmd-S:

<details>
  <summary>Screenshot</summary>
<img width="580" height="428" alt="Screenshot 2025-08-04 at 15 18 09" src="https://github.com/user-attachments/assets/de3f9062-045d-4f6b-9767-a8f023d4d0b6" />
</details>

This is super useful if you already use Ctrl/Cmd-S to trigger [Linter](https://obsidian.md/plugins?id=obsidian-linter).

## 🔨 Room for improvement

Though I don't currently plan on working on this plugin further, some potential improvements come to mind. [I've created an issue for each.](https://github.com/greetclammy/first-line-is-title/issues) PRs welcome.

## 👀 Alternative solutions

1. [Auto Filename](https://obsidian.md/plugins?id=auto-filename)
2. [File Title Updater](https://obsidian.md/plugins?id=file-title-updater)
3. [Filename Heading Sync](https://obsidian.md/plugins?id=obsidian-filename-heading-sync)

## 💬 Discuss

Feel free to share your thoughts about this plugin on:

- [The Obsidian Forum](https://forum.obsidian.md/t/plugin-to-automatically-copy-first-line-in-note-to-note-title/103558)
- [The Obsidian Members Group (OMG) Discord channel](https://discord.com/channels/686053708261228577/707816848615407697)
- [GitHub discussions](https://github.com/greetclammy/first-line-is-title/discussions)

Or open an issue!

## 🙏 Acknowledgements

This plugin builds on [Auto Filename](https://obsidian.md/plugins?id=auto-filename) and employs some of its code.

## 👨‍💻 What else I made

- [Adapt to Current View](https://github.com/greetclammy/adapt-to-current-view/)

Please ⭐️ this repository if you found the plugin helpful 😇
