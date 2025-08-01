# First Line is Title

- This custom plugin for [Obsidian](https://obsidian.md/) dynamically copies the first line in note body to note title.
- It's recommended that you back up your files before using this plugin.
- I don't yet plan on submiting this plugin to the Obsidian plugin gallery.
- This is an improved version of the [Auto Filename](https://github.com/rcsaquino/obsidian-auto-filename) plugin. 
- I vide coded this plugin with Claude Sonnet 4.

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
  
## 👀 Alternative solutions

1. [Auto Filename](https://github.com/rcsaquino/obsidian-auto-filename)
2. [File Title Updater](https://github.com/wenlzhang/obsidian-file-title-updater)
3. [Obsidian Filename Heading Sync](https://github.com/dvcrn/obsidian-filename-heading-sync)
