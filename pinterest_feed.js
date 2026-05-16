import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk?version=4.0';
import Soup from 'gi://Soup?version=3.0';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

export const PinterestFeed = GObject.registerClass({
    Signals: {
        'article-selected': {
            param_types: [GObject.TYPE_JSOBJECT]
        }
    }
}, class PinterestFeed extends Gtk.Box {
    _init() {
        super._init({
            orientation: Gtk.Orientation.VERTICAL,
            css_classes: ['news-feed-container'],
            spacing: 0,
            vexpand: true
        });

        this.session = new Soup.Session();

        const filterScrolled = new Gtk.ScrolledWindow({
            vscrollbar_policy: Gtk.PolicyType.NEVER,
            hscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
            margin_bottom: 12
        });
        this.filterBar = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, css_classes: ['filter-bar'] });
        filterScrolled.set_child(this.filterBar);
        this.append(filterScrolled);

        const tabs = ["Top Stories", "Trending", "Breaking News", "Technology", "Sports", "Entertainment"];
        tabs.forEach(tab => {
            const btn = new Gtk.Button({ label: tab, css_classes: ['filter-pill'] });
            if (tab === "Top Stories") btn.add_css_class('active');
            
            btn.connect('clicked', () => {
                let child = this.filterBar.get_first_child();
                while (child) {
                    child.remove_css_class('active');
                    child = child.get_next_sibling();
                }
                btn.add_css_class('active');
                this.fetchNews(tab);
            });
            this.filterBar.append(btn);
        });

        const grid = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            css_classes: ['masonry-grid'],
            spacing: 12,
            homogeneous: true,
            vexpand: true
        });

        this.columns = [
            new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, css_classes: ['masonry-column'], spacing: 12, vexpand: true }),
            new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, css_classes: ['masonry-column'], spacing: 12, vexpand: true })
        ];

        grid.append(this.columns[0]);
        grid.append(this.columns[1]);
        this.append(grid);

        this.fetchNews();
    }

    showShimmer() {
        this.columns.forEach(col => {
            let child = col.get_first_child();
            while (child) {
                let next = child.get_next_sibling();
                col.remove(child);
                child = next;
            }
            for (let i = 0; i < 3; i++) {
                const shimmer = new Gtk.Box({
                    css_classes: ['pin-item', 'shimmer'],
                    width_request: 200,
                    height_request: 300,
                    margin_bottom: 12
                });
                col.append(shimmer);
            }
        });
    }

    async fetchNews(query = "Top Stories") {
        this.showShimmer();

        const defaultRss = "https://feeds.bbci.co.uk/news/rss.xml";
        const queryRss = `https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=rss`;
        const rssUrl = encodeURIComponent(query === "Top Stories" ? defaultRss : queryRss);
        
        const url = `https://api.rss2json.com/v1/api.json?rss_url=${rssUrl}`;
        const msg = Soup.Message.new('GET', url);
        
        this.session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, null, (session, res) => {
            this.columns.forEach(col => {
                let child = col.get_first_child();
                while (child) {
                    let next = child.get_next_sibling();
                    col.remove(child);
                    child = next;
                }
            });

            try {
                const bytes = session.send_and_read_finish(res);
                const data = new TextDecoder().decode(bytes.get_data ? bytes.get_data() : bytes.toArray());
                const json = JSON.parse(data);
                
                if (json.items && json.items.length > 0) {
                    json.items.forEach((item, index) => {
                        const colIndex = index % 2;
                        try {
                            const pin = this.createPin(item);
                            this.columns[colIndex].append(pin);
                        } catch (pinErr) {
                            console.error(`Pinterest: Error creating pin ${index}:`, pinErr.message);
                        }
                    });
                }
            } catch (e) {
                console.error('Pinterest: Fetch Error:', e.message);
            }
        });
    }

    triggerLocalAIOverview() {
        if (!this.articles || this.articles.length === 0) {
            console.log("No articles to summarize.");
            return;
        }

        console.log("Generating Local AI Overview...");
        // Aggregate titles and descriptions
        const textToSummarize = this.articles.map(a => `${a.title}. ${a.description}`).join(" ");
        
        try {
            const runnerPath = GLib.build_filenamev([GLib.get_current_dir(), 'assets', 'models', 'ai-runner']);
            const modelPath = GLib.build_filenamev([GLib.get_current_dir(), 'assets', 'models', 'tiny-model.gguf']);
            
            // Execute the native C++ inference engine directly, passing the GGUF model and prompt
            const [, stdout_fd, stderr_fd, child_pid] = GLib.spawn_async_with_pipes(
                null, 
                [runnerPath, '-m', modelPath, '-p', textToSummarize], 
                null, 
                GLib.SpawnFlags.SEARCH_PATH, 
                null
            );

            const outStream = new Gio.UnixInputStream({ fd: stdout_fd, close_fd: true });
            const dataStream = new Gio.DataInputStream({ base_stream: outStream });

            // Read async
            dataStream.read_line_async(GLib.PRIORITY_DEFAULT, null, (stream, res) => {
                try {
                    const [outBytes] = stream.read_line_finish(res);
                    if (outBytes) {
                        const outStr = new TextDecoder().decode(outBytes);
                        const result = JSON.parse(outStr);
                        if (result.summary) {
                            this.showAIOverviewCard(result.summary);
                        } else {
                            console.error("AI Error:", result.error);
                        }
                    }
                } catch (e) {
                    console.error("Failed to read AI output", e);
                }
            });

        } catch (e) {
            console.error("Failed to start AI bridge", e);
        }
    }

    showAIOverviewCard(summary) {
        const dialog = new Adw.MessageDialog({
            heading: "✨ Local AI Overview",
            body: summary,
            close_response: "ok"
        });
        dialog.add_response("ok", "Dismiss");
        
        // Find root window to attach dialog
        let parent = this.get_root();
        if (parent && parent instanceof Gtk.Window) {
            dialog.present(parent);
        }
    }

    createPin(item) {
        const pin = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            css_classes: ['pin-item']
        });

        const logoPath = GLib.build_filenamev([GLib.get_current_dir(), 'assets', 'logo.png']);
        const imageUrl = item.thumbnail || item.enclosure?.link || logoPath;
        
        const image = new Gtk.Picture({
            css_classes: ['pin-image'],
            can_shrink: true,
            width_request: 200,
            height_request: 150
        });

        try {
            if (imageUrl.startsWith('http')) {
                image.set_file(Gio.File.new_for_uri(imageUrl));
            } else {
                image.set_file(Gio.File.new_for_path(imageUrl));
            }
        } catch (imgErr) {
            image.set_file(Gio.File.new_for_path(logoPath));
        }

        const caption = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            css_classes: ['pin-caption'],
            spacing: 4
        });

        const title = new Gtk.Label({
            label: item.title,
            wrap: true,
            justify: Gtk.Justification.LEFT,
            halign: Gtk.Align.START,
            css_classes: ['pin-title']
        });

        const meta = new Gtk.Label({
            label: `${item.author || 'BBC News'}`,
            halign: Gtk.Align.START,
            css_classes: ['pin-meta']
        });

        caption.append(title);
        caption.append(meta);

        pin.append(image);
        pin.append(caption);

        const gesture = new Gtk.GestureClick();
        gesture.connect('pressed', () => {
            console.log(`Pinterest: Selecting article: ${item.title}`);
            this.emit('article-selected', item);
        });
        pin.add_controller(gesture);

        return pin;
    }
});
