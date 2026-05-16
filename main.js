import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw?version=1';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gdk from 'gi://Gdk';

import { WeatherHeaderWidget } from './weatherinfo.js';
import { PinterestFeed } from './pinterest_feed.js';
import { WeatherPage } from './weather_page.js';
import { ArticleReader } from './article_reader.js';
import { AlertDetailPage } from './alert_detail_page.js';
import { AutoUpdater } from './updater.js';
import { SettingsPage } from './settings_page.js';

const Gettext = imports.gettext;
Gettext.bindtextdomain('swavoti-news', '/usr/share/locale');
Gettext.textdomain('swavoti-news');
const _ = Gettext.gettext;

const SwavotiNewsApp = GObject.registerClass(
class SwavotiNewsApp extends Adw.Application {
    _init() {
        super._init({
            application_id: 'za.co.swavoti.news',
            flags: Gio.ApplicationFlags.FLAGS_NONE
        });
    }

    vfunc_startup() {
        super.vfunc_startup();
        this.loadStyles();
        Adw.StyleManager.get_default().set_color_scheme(Adw.ColorScheme.FORCE_LIGHT);
        
        // CSS provider for dynamic font scaling
        this.fontCssProvider = new Gtk.CssProvider();
        Gtk.StyleContext.add_provider_for_display(Gdk.Display.get_default(), this.fontCssProvider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION + 1);
    }

    loadStyles() {
        const provider = new Gtk.CssProvider();
        provider.load_from_file(Gio.File.new_for_path(GLib.build_filenamev([GLib.get_current_dir(), 'style.css'])));
        Gtk.StyleContext.add_provider_for_display(Gdk.Display.get_default(), provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
    }

    vfunc_activate() {
        let window = this.active_window;
        if (!window) {
            window = new Adw.ApplicationWindow({
                application: this,
                title: 'Swavoti News',
                default_width: 800,
                default_height: 900
            });

            const rootBox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL });
            window.set_content(rootBox);

            this.sidebar = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, css_classes: ['custom-sidebar'] });
            rootBox.append(this.sidebar);

            const createNavBtn = (name, iconPath, labelText) => {
                const btn = new Gtk.Button({ css_classes: ['nav-button'] });
                const content = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 4, halign: Gtk.Align.CENTER });
                content.append(new Gtk.Image({ file: GLib.build_filenamev([GLib.get_current_dir(), 'assets', iconPath]), pixel_size: 24 }));
                content.append(new Gtk.Label({ label: labelText, css_classes: ['nav-label'] }));
                btn.set_child(content);
                btn.connect('clicked', () => {
                    this.stack.set_visible_child_name(name);
                    this.updateNavHighlight(name);
                    header.visible = (name !== 'weather' && name !== 'settings');
                });
                return btn;
            };

            this.newsBtn = createNavBtn('news', 'news_lucide.svg', 'NEWS');
            this.weatherBtn = createNavBtn('weather', 'weather_lucide.svg', 'WEATHER');
            this.settingsBtn = createNavBtn('settings', 'settings_lucide.svg', 'SETTINGS');
            
            this.sidebar.append(this.newsBtn);
            this.sidebar.append(this.weatherBtn);
            
            const spacer = new Gtk.Box({ vexpand: true });
            this.sidebar.append(spacer);
            this.sidebar.append(this.settingsBtn);
            
            this.updateNavHighlight('news');

            const contentBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, hexpand: true });
            rootBox.append(contentBox);

            const toolbarView = new Adw.ToolbarView({ vexpand: true });
            contentBox.append(toolbarView);

            const header = new Adw.HeaderBar();
            this.backBtn = new Gtk.Button({ icon_name: 'go-previous-symbolic', visible: false });
            this.backBtn.connect('clicked', () => {
                this.stack.set_visible_child_name('news');
                this.updateNavHighlight('news');
                this.backBtn.visible = false;
                this.sidebar.visible = true;
                header.visible = true;
            });
            header.pack_start(this.backBtn);

            const logo = new Gtk.Image({ file: GLib.build_filenamev([GLib.get_current_dir(), 'assets', 'logo.png']), pixel_size: 32 });
            header.pack_start(logo);
            header.pack_start(new WeatherHeaderWidget());

            // NEW FEATURE: Live Digital Clock
            this.clockLabel = new Gtk.Label({ css_classes: ['clock-widget'], margin_start: 16 });
            header.pack_start(this.clockLabel);
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
                const now = new Date();
                const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                this.clockLabel.set_label(timeString);
                return GLib.SOURCE_CONTINUE;
            });

            this.updateBanner = new Gtk.Label({ label: "DOWNLOADING UPDATE...", css_classes: ['blue-text', 'bold'], visible: false });
            header.pack_start(this.updateBanner);

            // Search and Advanced Filters
            const searchBox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 4 });
            this.searchEntry = new Gtk.SearchEntry({ placeholder_text: 'Search news...', hexpand: true });
            searchBox.append(this.searchEntry);

            // Advanced Filter Popover
            const filterMenu = new Gio.Menu();
            filterMenu.append("Sort by Date", "app.filter-date");
            filterMenu.append("Filter by Topic", "app.filter-topic");
            filterMenu.append("Generate AI Overview", "app.ai-overview");
            
            const filterPopover = Gtk.PopoverMenu.new_from_model(filterMenu);
            const filterBtn = new Gtk.MenuButton({ 
                icon_name: 'view-filter-symbolic', 
                popover: filterPopover,
                css_classes: ['flat']
            });
            
            // AI Action placeholder
            const aiAction = new Gio.SimpleAction({ name: 'ai-overview' });
            aiAction.connect('activate', () => {
                this.feed.triggerLocalAIOverview();
            });
            this.add_action(aiAction);

            searchBox.append(filterBtn);

            header.set_title_widget(searchBox);
            toolbarView.add_top_bar(header);

            this.stack = new Adw.ViewStack({ vexpand: true });
            
            this.feed = new PinterestFeed();
            const feedScrolled = new Gtk.ScrolledWindow({ vexpand: true });
            feedScrolled.set_child(this.feed);
            this.stack.add_named(feedScrolled, 'news');

            this.weatherPage = new WeatherPage();
            this.stack.add_named(this.weatherPage, 'weather');

            this.articleReader = new ArticleReader();
            this.stack.add_named(this.articleReader, 'article');

            this.alertDetailPage = new AlertDetailPage();
            this.stack.add_named(this.alertDetailPage, 'alert_detail');

            this.settingsPage = new SettingsPage();
            this.stack.add_named(this.settingsPage, 'settings');

            // CSS provider for dark mode
            this.darkCssProvider = new Gtk.CssProvider();

            // Connect Settings
            this.settingsPage.connect('dark-mode-toggled', (_, isDark) => {
                Adw.StyleManager.get_default().set_color_scheme(
                    isDark ? Adw.ColorScheme.FORCE_DARK : Adw.ColorScheme.FORCE_LIGHT
                );
                
                if (isDark) {
                    const darkCssPath = GLib.build_filenamev([GLib.get_current_dir(), 'style.dark.css']);
                    if (GLib.file_test(darkCssPath, GLib.FileTest.EXISTS)) {
                        this.darkCssProvider.load_from_path(darkCssPath);
                        Gtk.StyleContext.add_provider_for_display(Gdk.Display.get_default(), this.darkCssProvider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION + 2);
                    }
                } else {
                    Gtk.StyleContext.remove_provider_for_display(Gdk.Display.get_default(), this.darkCssProvider);
                }
            });

            this.settingsPage.connect('font-size-changed', (_, sizeStr) => {
                let sizeCss = "14px";
                if (sizeStr === "Small") sizeCss = "12px";
                if (sizeStr === "Large") sizeCss = "18px";
                if (sizeStr === "Extra Large") sizeCss = "22px";
                
                this.fontCssProvider.load_from_data(`* { font-size: ${sizeCss}; }`, -1);
            });

            this.settingsPage.connect('language-changed', (_, langStr) => {
                // In a true OS integration, this would set LC_ALL or update system env.
                // For demonstration of native gettext interaction:
                const langCodes = { "English": "en_US.UTF-8", "Spanish": "es_ES.UTF-8", "French": "fr_FR.UTF-8", "Zulu": "zu_ZA.UTF-8" };
                const code = langCodes[langStr] || "en_US.UTF-8";
                GLib.setenv("LANGUAGE", code, true);
                console.log(`System native translation locale switched to: ${code}`);
                // Note: Gettext requires app restart to pull new locale dictionaries into GTK.
                this.updateBanner.set_label(`LOCALE UPDATED TO ${langStr.toUpperCase()} (RESTART REQUIRED)`);
                this.updateBanner.visible = true;
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 5000, () => {
                    this.updateBanner.visible = false;
                    return GLib.SOURCE_REMOVE;
                });
            });

            toolbarView.set_content(this.stack);

            // Auto Updater Integration
            this.updater = new AutoUpdater();
            
            this.updater.connect('update-available', () => {
                this.settingsPage.showUpdateAvailable();
                if (this.stack.get_visible_child_name() !== 'settings') {
                    this.updateBanner.set_label("UPDATE AVAILABLE");
                    this.updateBanner.visible = true;
                }
            });

            this.updater.connect('update-progress', (_, msg) => {
                this.settingsPage.showUpdateProgress(msg);
                this.updateBanner.set_label(msg);
                this.updateBanner.visible = true;
            });

            this.updater.connect('update-error', (_, msg) => {
                this.settingsPage.showUpdateError(msg);
                this.updateBanner.set_label("UPDATE FAILED");
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 3000, () => {
                    this.updateBanner.visible = false;
                    return GLib.SOURCE_REMOVE;
                });
            });

            this.settingsPage.connect('check-updates', () => this.updater.checkForUpdates());
            this.settingsPage.connect('apply-update', () => this.updater.applyUpdate());

            // Back button for alert detail
            this.alertDetailPage.backBtn.connect('clicked', () => {
                this.stack.set_visible_child_name('weather');
                this.sidebar.visible = true;
            });

            this.feed.connect('article-selected', (feed, item) => {
                this.articleReader.loadArticle(item);
                this.stack.set_visible_child_name('article');
                this.backBtn.visible = true;
                this.sidebar.visible = false;
            });

            this.searchEntry.connect('activate', () => {
                const query = this.searchEntry.get_text();
                if (query) {
                    this.stack.set_visible_child_name('news');
                    this.updateNavHighlight('news');
                    this.feed.fetchNews(query);
                }
            });
        }
        window.present();
    }

    updateNavHighlight(name) {
        this.newsBtn.remove_css_class('active');
        this.weatherBtn.remove_css_class('active');
        if (name === 'news') this.newsBtn.add_css_class('active');
        else if (name === 'weather') this.weatherBtn.add_css_class('active');
    }
});

const app = new SwavotiNewsApp();
app.run([GLib.get_prgname()].concat(ARGV));
