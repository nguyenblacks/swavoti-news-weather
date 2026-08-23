import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw?version=1';
import Soup from 'gi://Soup?version=3.0';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

// Data model for news items
export const NewsArticle = GObject.registerClass({
    Properties: {
        'title': GObject.ParamSpec.string('title', 'Title', 'Article title', GObject.ParamFlags.READWRITE, ''),
        'author': GObject.ParamSpec.string('author', 'Author', 'Article author', GObject.ParamFlags.READWRITE, ''),
        'date': GObject.ParamSpec.string('date', 'Date', 'Publication date', GObject.ParamFlags.READWRITE, ''),
        'image-url': GObject.ParamSpec.string('image-url', 'ImageUrl', 'Thumbnail URL', GObject.ParamFlags.READWRITE, ''),
        'link': GObject.ParamSpec.string('link', 'Link', 'Article URL', GObject.ParamFlags.READWRITE, '')
    }
}, class NewsArticle extends GObject.Object {
    _init(data = {}) {
        super._init();
        this.title = data.title || 'Untitled';
        // Removed the "Enterprise Desk" placeholder. Falls back to empty if no author is in the feed.
        this.author = data.author || '';
        this.date = data.pubDate ? new Date(data.pubDate).toLocaleDateString() : '';
        this.image_url = data.thumbnail || data.enclosure?.link || '';
        this.link = data.link || '';
    }
});

export const EnterpriseNewsFeed = GObject.registerClass({
    Signals: {
        'article-selected': {
            param_types: [GObject.TYPE_OBJECT]
        }
    }
}, class EnterpriseNewsFeed extends Gtk.Box {
    _init() {
        super._init({
            orientation: Gtk.Orientation.VERTICAL,
            css_classes: ['enterprise-feed'],
            spacing: 0,
            vexpand: true,
            hexpand: true
        });

        this._session = new Soup.Session();
        this._model = new Gio.ListStore({ item_type: NewsArticle });

        this._buildFilterBar();
        this._buildGrid();

        this.fetchNews('Top Stories');
    }

    _buildFilterBar() {
        const filterScrolled = new Gtk.ScrolledWindow({
            vscrollbar_policy: Gtk.PolicyType.NEVER,
            hscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
            css_classes: ['filter-scroll-container']
        });

        this._filterBar = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            css_classes: ['filter-bar'],
            spacing: 8,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 16,
            margin_end: 16
        });

        filterScrolled.set_child(this._filterBar);
        this.append(filterScrolled);

        const categories = ["Top Stories", "Markets", "Technology", "Global Economy", "Policy"];
        categories.forEach(cat => {
            const btn = new Gtk.Button({
                label: cat,
                css_classes: ['filter-pill', 'flat']
            });
            if (cat === "Top Stories") btn.add_css_class('suggested-action');

            btn.connect('clicked', () => {
                let child = this._filterBar.get_first_child();
                while (child) {
                    child.remove_css_class('suggested-action');
                    child = child.get_next_sibling();
                }
                btn.add_css_class('suggested-action');
                this._currentCategory = cat;
                this.fetchNews(cat);
            });
            this._filterBar.append(btn);
        });
    }

    _buildGrid() {
        const factory = new Gtk.SignalListItemFactory();

        factory.connect('setup', (fact, list_item) => {
            const card = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                css_classes: ['card', 'news-card'],
                spacing: 0
            });

            const image = new Gtk.Picture({
                css_classes: ['card-image'],
                can_shrink: true,
                content_fit: Gtk.ContentFit.COVER,
                height_request: 140
            });

            const body = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                css_classes: ['card-body'],
                spacing: 6,
                margin_top: 12,
                margin_bottom: 12,
                margin_start: 12,
                margin_end: 12
            });

            const metaBox = new Gtk.Box({
                orientation: Gtk.Orientation.HORIZONTAL,
                spacing: 8
            });

            const author = new Gtk.Label({
                css_classes: ['caption', 'dim-label'],
                halign: Gtk.Align.START
            });

            const date = new Gtk.Label({
                css_classes: ['caption', 'dim-label'],
                halign: Gtk.Align.END,
                hexpand: true
            });

            metaBox.append(author);
            metaBox.append(date);

            const title = new Gtk.Label({
                wrap: true,
                lines: 2,
                ellipsize: 3, // PANGO_ELLIPSIZE_END
                justify: Gtk.Justification.LEFT,
                halign: Gtk.Align.START,
                css_classes: ['heading']
            });

            body.append(metaBox);
            body.append(title);
            card.append(image);
            card.append(body);

            const gesture = new Gtk.GestureClick();
            gesture.connect('pressed', () => {
                const item = list_item.get_item();
                if (item) this.emit('article-selected', item);
            });
            card.add_controller(gesture);

            list_item.set_child(card);
        });

        factory.connect('bind', (fact, list_item) => {
            const item = list_item.get_item();
            const card = list_item.get_child();
            const image = card.get_first_child();
            const body = image.get_next_sibling();
            const metaBox = body.get_first_child();
            const author = metaBox.get_first_child();
            const date = author.get_next_sibling();
            const title = metaBox.get_next_sibling();

            title.set_label(item.title);
            author.set_label(item.author);
            date.set_label(item.date);

            // Hide the author label entirely if the feed didn't provide one to avoid empty gaps
            author.set_visible(!!item.author);

            // Thumbnail image handling with fallback styling
            if (item.image_url && item.image_url.startsWith('http')) {
                image.set_file(Gio.File.new_for_uri(item.image_url));
                image.remove_css_class('no-image-placeholder');
            } else {
                image.set_paintable(null);
                image.add_css_class('no-image-placeholder');
            }
        });

        const selectionModel = new Gtk.NoSelection({ model: this._model });
        const gridView = new Gtk.GridView({
            model: selectionModel,
            factory: factory,
            max_columns: 4,
            min_columns: 2,
            single_click_activate: true,
            css_classes: ['enterprise-grid']
        });

        const scrolled = new Gtk.ScrolledWindow({
            child: gridView,
            vexpand: true,
            hexpand: true,
            margin_start: 16,
            margin_end: 16,
            margin_bottom: 16
        });

        this.append(scrolled);
    }

    async fetchNews(query = "Top Stories") {
        this._model.remove_all();

        const rssUrl = encodeURIComponent(`https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=rss`);
        const url = `https://api.rss2json.com/v1/api.json?rss_url=${rssUrl}`;
        const msg = Soup.Message.new('GET', url);

        try {
            const bytes = await new Promise((resolve, reject) => {
                this._session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, null, (session, res) => {
                    try {
                        resolve(session.send_and_read_finish(res));
                    } catch (e) {
                        reject(e);
                    }
                });
            });

            const data = new TextDecoder().decode(bytes.get_data ? bytes.get_data() : bytes.toArray());
            const json = JSON.parse(data);

            if (json.items) {
                const articles = json.items.map(item => new NewsArticle(item));
                this._model.splice(0, 0, articles);
            }
        } catch (e) {
            console.error('Failed to fetch enterprise news:', e.message);
        }
    }
});
