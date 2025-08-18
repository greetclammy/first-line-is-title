# First Line is Title

Automatically put the note's first line in title.

Can replace forbidden characters with alternatives. Supports custom replacemet rules.

![473493035-31c57879-eff3-4615-b358-83b12c97ecb4](https://github.com/user-attachments/assets/db239dd6-ae89-4ffa-8c3c-7a1788e600ed)

**⚠️ It's recommended that you back up your files before using this plugin.**

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

This plugin adds three commmands to the Command palette:

<img width="455" height="232" alt="image" src="https://github.com/user-attachments/assets/6efdace0-e168-4115-ac63-c2a63acaf4fd" />

For the times when you want to force the plugin to update the title, I recommend to create a macro like this with [Commander](https://obsidian.md/plugins?id=cmdr) and bind it to Ctrl/Cmd-S:

<details>
  <summary>Screenshot</summary>
<img width="587" height="444" alt="Screenshot 2025-08-18 at 03 02 27" src="https://github.com/user-attachments/assets/156f775a-a3d9-4f61-a7b2-799a12a17ae5" />
</details>

This is super useful if you already use Ctrl/Cmd-S to trigger [Linter](https://obsidian.md/plugins?id=obsidian-linter).

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

Please ⭐️ the GitHub repository if you found the plugin helpful 😇
