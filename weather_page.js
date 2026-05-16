import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk?version=4.0';
import WebKit from 'gi://WebKit?version=6.0';
import Adw from 'gi://Adw?version=1';

export const WeatherPage = GObject.registerClass(
class WeatherPage extends Gtk.Box {
    _init() {
        super._init({
            orientation: Gtk.Orientation.VERTICAL,
            vexpand: true,
            hexpand: true
        });

        this.buildUI();
    }

    buildUI() {
        // Dedicated Header for WebView control
        const header = new Adw.HeaderBar();
        const titleWidget = new Adw.WindowTitle({ title: "Weather Platform", subtitle: "Live Satellite & Forecast" });
        header.set_title_widget(titleWidget);

        const refreshBtn = new Gtk.Button({ icon_name: 'view-refresh-symbolic' });
        refreshBtn.connect('clicked', () => this.webView.reload());
        header.pack_end(refreshBtn);

        this.append(header);

        // WebKit WebView
        this.webView = new WebKit.WebView({
            vexpand: true,
            hexpand: true
        });

        // Use weather.com for full weekly forecasts
        this.webView.load_uri('https://weather.com');
        
        this.append(this.webView);
    }
});
