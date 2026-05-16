import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw?version=1';
import GLib from 'gi://GLib';

export const SettingsPage = GObject.registerClass({
    Signals: {
        'check-updates': {},
        'apply-update': {},
        'dark-mode-toggled': { param_types: [GObject.TYPE_BOOLEAN] },
        'font-size-changed': { param_types: [GObject.TYPE_STRING] },
        'language-changed': { param_types: [GObject.TYPE_STRING] }
    }
}, class SettingsPage extends Gtk.Box {
    _init() {
        super._init({
            orientation: Gtk.Orientation.VERTICAL,
            css_classes: ['settings-page'],
            vexpand: true,
            hexpand: true
        });

        this.buildUI();
    }

    buildUI() {
        const header = new Adw.HeaderBar();
        const titleWidget = new Adw.WindowTitle({ title: "Settings", subtitle: "Preferences & Updates" });
        header.set_title_widget(titleWidget);
        this.append(header);

        // Native Adwaita Preferences Page
        const prefPage = new Adw.PreferencesPage();
        this.append(prefPage);

        // --- GROUP 1: Appearance & Accessibility ---
        const appearanceGroup = new Adw.PreferencesGroup({ title: "Appearance & Accessibility" });
        
        this.darkModeSwitch = new Adw.SwitchRow({ 
            title: "Dark Mode", 
            subtitle: "Enable comfortable reading in low light." 
        });
        this.darkModeSwitch.connect('notify::active', () => {
            this.emit('dark-mode-toggled', this.darkModeSwitch.get_active());
        });
        appearanceGroup.add(this.darkModeSwitch);

        // Dropdown for Font Size
        const fontModel = Gtk.StringList.new(["Small", "Medium (Default)", "Large", "Extra Large"]);
        this.fontRow = new Adw.ComboRow({
            title: "Text Size",
            subtitle: "Adjust font scaling across the app.",
            model: fontModel,
            selected: 1
        });
        this.fontRow.connect('notify::selected-item', () => {
            const selectedStr = this.fontRow.get_selected_item().get_string();
            this.emit('font-size-changed', selectedStr);
        });
        appearanceGroup.add(this.fontRow);
        
        prefPage.add(appearanceGroup);

        // --- GROUP 2: Feed & Reading Preferences ---
        const feedGroup = new Adw.PreferencesGroup({ title: "Reading & Content" });
        
        this.recommendFeedSwitch = new Adw.SwitchRow({ 
            title: "Recommended Feed", 
            subtitle: "Show AI-curated news on the home screen.",
            active: true
        });
        feedGroup.add(this.recommendFeedSwitch);

        const langModel = Gtk.StringList.new(["English", "Spanish", "French", "Zulu", "Afrikaans"]);
        this.translateRow = new Adw.ComboRow({
            title: "Native OS Translation",
            subtitle: "Use GNOME gettext to translate the app interface.",
            model: langModel,
            selected: 0
        });
        this.translateRow.connect('notify::selected-item', () => {
            const selectedStr = this.translateRow.get_selected_item().get_string();
            this.emit('language-changed', selectedStr);
        });
        feedGroup.add(this.translateRow);

        prefPage.add(feedGroup);

        // --- GROUP 3: Software & Updates ---
        const updateGroup = new Adw.PreferencesGroup({ title: "Software Updates" });

        const updateRow = new Adw.ActionRow({ title: "Swavoti News Super Edition", subtitle: "Version 1.0.0" });
        
        // Custom Update Button with Spinner
        this.checkBtn = new Gtk.Button({ css_classes: ['suggested-action'], valign: Gtk.Align.CENTER });
        const btnBox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 6 });
        this.btnSpinner = new Gtk.Spinner();
        this.btnLabel = new Gtk.Label({ label: "Check for Updates" });
        btnBox.append(this.btnSpinner);
        btnBox.append(this.btnLabel);
        this.checkBtn.set_child(btnBox);

        this.checkBtn.connect('clicked', () => {
            this.btnSpinner.start();
            this.btnLabel.set_label("Checking...");
            this.checkBtn.sensitive = false;
            updateRow.set_subtitle("Checking for updates...");
            this.emit('check-updates');
        });

        this.applyBtn = new Gtk.Button({ label: "Apply Update", css_classes: ['destructive-action'], valign: Gtk.Align.CENTER, visible: false });
        this.applyBtn.connect('clicked', () => {
            this.emit('apply-update');
        });

        const actionBox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 6 });
        actionBox.append(this.applyBtn);
        actionBox.append(this.checkBtn);
        
        updateRow.add_suffix(actionBox);
        updateGroup.add(updateRow);
        
        // Keep a reference to the subtitle to update it from main.js
        this.updateSubtitleLabel = updateRow;

        prefPage.add(updateGroup);
    }

    showUpdateAvailable() {
        this.btnSpinner.stop();
        this.btnLabel.set_label("Check Again");
        this.checkBtn.sensitive = true;
        this.updateSubtitleLabel.set_subtitle("A new update is available!");
        this.applyBtn.visible = true;
    }

    showUpdateProgress(msg) {
        this.updateSubtitleLabel.set_subtitle(msg);
        this.checkBtn.sensitive = false;
        this.applyBtn.sensitive = false;
    }

    showUpdateError(msg) {
        this.btnSpinner.stop();
        this.btnLabel.set_label("Check for Updates");
        this.checkBtn.sensitive = true;
        this.updateSubtitleLabel.set_subtitle(`Update Error: ${msg}`);
    }
});
