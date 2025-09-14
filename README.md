# First Line is Title

Automatically put first line in note title.

Can replace forbidden characters with safe alternatives. Supports custom replacemet rules.

![473493035-31c57879-eff3-4615-b358-83b12c97ecb4](https://github.com/user-attachments/assets/db239dd6-ae89-4ffa-8c3c-7a1788e600ed)

**⚠️ It's recommended that you back up your files before using this plugin.**

## ⚙️ Settings page overview

<details>
  <summary>Screenshot</summary>
<img width="1126" height="2500" alt="settings" src="https://github.com/user-attachments/assets/b12374f2-d174-40f5-8036-e7c7c44a3e30" />
</details>

## ✅ Installation

Untill _First Line is Title_ is made availiable in the plugin browser, follow the steps below to install it.

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

1. Download `first-line-is-title.zip` in the `Assets` of a [latest release](https://github.com/greetclammy/first-line-is-title/releases).
2. Unzip the folder and place it in the `.obsidian/plugins` folder (hidden on most OSes) at the root of your vault.
3. Reload plugins or app.
4. Enable _First Line is Title_ in `Settings > Community plugins > Installed plugins`.

## 💡 Tips

### New note template

It's recommended to use this plugin with a new note template that puts the cursor in note body on note creation, configured in [Templater](https://obsidian.md/plugins?id=templater-obsidian) settings.

Here's a template that I use:

<details>
  <summary>Templater script</summary>

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

This plugin adds three commmands to the Command palette:

<img width="455" height="232" alt="image" src="https://github.com/user-attachments/assets/6efdace0-e168-4115-ac63-c2a63acaf4fd" />

For the times when you want to force the plugin to update the title, I recommend to create a macro like this with [Commander](https://obsidian.md/plugins?id=cmdr) and bind it to Ctrl/Cmd-S:

<details>
  <summary>Screenshot</summary>
<img width="587" height="444" alt="Screenshot 2025-08-18 at 03 02 27" src="https://github.com/user-attachments/assets/156f775a-a3d9-4f61-a7b2-799a12a17ae5" />
</details>

This is super useful if you already use Ctrl/Cmd-S to trigger [Linter](https://obsidian.md/plugins?id=obsidian-linter).

## ⭐️ Support

- [Report bugs](https://github.com/greetclammy/first-line-is-title/issues)
- [Request features](https://github.com/greetclammy/first-line-is-title/issues)
- [Contribute improvements](https://github.com/greetclammy/first-line-is-title/pulls)
- Share your thoughts on [Obsidian Forum](https://forum.obsidian.md/t/plugin-to-automatically-copy-first-line-in-note-to-note-title/103558), [Obsidian Members Group](https://discord.com/channels/686053708261228577/707816848615407697) or [GitHub discussions](https://github.com/greetclammy/first-line-is-title/discussions)

If you find this plugin helpful, please star the repository 😇

## 👀 Alternative solutions

1. [Auto Filename](https://obsidian.md/plugins?id=auto-filename)
2. [File Title Updater](https://obsidian.md/plugins?id=file-title-updater)
3. [Filename Heading Sync](https://obsidian.md/plugins?id=obsidian-filename-heading-sync)

## 🙏 Acknowledgements

This plugin builds on [Auto Filename](https://obsidian.md/plugins?id=auto-filename) and employs some of its code.

## 👨‍💻 What else I made

- [Adapt to Current View](https://github.com/greetclammy/adapt-to-current-view/)
