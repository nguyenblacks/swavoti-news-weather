import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk?version=4.0';
import Gdk from 'gi://Gdk?version=4.0';
import Adw from 'gi://Adw?version=1';
import Soup from 'gi://Soup?version=3.0';
import GLib from 'gi://GLib';

export const WeatherPage = GObject.registerClass(
class WeatherPage extends Gtk.Box {
    _init() {
        super._init({
            orientation: Gtk.Orientation.VERTICAL,
            vexpand: true,
            hexpand: true
        });

        this._session = new Soup.Session();

        // Coordinates for Musina, Limpopo (defaults)
        this._lat = -22.3333;
        this._lon = 30.0333;
        this._locationName = "Musina, Limpopo";

        this._loadCSS();
        this._buildUI();
        this.fetchWeatherData();
    }

    _loadCSS() {
        const cssData = `
            .weather-page-container {
                background-color: #f5f5f7;
            }
            .weather-dashboard {
                padding: 24px;
            }
            .weather-hero {
                padding: 40px 24px;
                border-radius: 32px;
                background: linear-gradient(135deg, rgba(0, 123, 255, 0.9) 0%, rgba(0, 86, 179, 0.9) 100%);
                color: white;
                margin-bottom: 24px;
            }
            .hero-temp {
                font-size: 72px;
                font-weight: 900;
                color: white;
            }
            .hero-location {
                font-size: 24px;
                font-weight: 700;
                color: white;
            }
            .weather-section-title {
                font-size: 18px;
                font-weight: 800;
                margin-top: 16px;
                margin-bottom: 12px;
                color: #111;
            }
            .hourly-box {
                padding: 16px;
                border-radius: 20px;
                background-color: #ffffff;
                border: 1px solid #eee;
            }
            .hourly-item {
                padding: 12px 16px;
                border-radius: 12px;
                background-color: #f9f9fb;
                margin-right: 8px;
            }
            .weekly-item {
                padding: 16px;
                border-radius: 16px;
                background-color: #ffffff;
                margin-bottom: 8px;
                border: 1px solid #eee;
            }
            .temp-label {
                font-size: 16px;
                font-weight: 700;
            }
            .dim-label {
                color: rgba(0,0,0,0.6);
            }
        `;

        const provider = new Gtk.CssProvider();
        provider.load_from_string(cssData);
        Gtk.StyleContext.add_provider_for_display(
            Gdk.Display.get_default(),
            provider,
            Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
        );
    }

    _buildUI() {
        const header = new Adw.HeaderBar();
        const titleWidget = new Adw.WindowTitle({ 
            title: "Weather Station", 
            subtitle: "Powered by Open-Meteo" 
        });
        header.set_title_widget(titleWidget);

        const refreshBtn = new Gtk.Button({ 
            icon_name: 'view-refresh-symbolic', 
            tooltip_text: 'Refresh Data' 
        });
        refreshBtn.connect('clicked', () => this.fetchWeatherData()); 
        header.pack_end(refreshBtn);
        this.append(header);

        const scrolledWindow = new Gtk.ScrolledWindow({
            hscrollbar_policy: Gtk.PolicyType.NEVER,
            vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
            vexpand: true,
            hexpand: true,
            css_classes: ['weather-page-container']
        });

        this._mainContainer = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            css_classes: ['weather-dashboard'],
            spacing: 16
        });

        scrolledWindow.set_child(this._mainContainer);
        this.append(scrolledWindow);

        // --- 1. Hero Section ---
        this._heroBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            css_classes: ['weather-hero'],
            spacing: 4,
            halign: Gtk.Align.FILL
        });

        this._locationLabel = new Gtk.Label({
            label: this._locationName,
            css_classes: ['hero-location'],
            halign: Gtk.Align.CENTER
        });

        this._tempLabel = new Gtk.Label({
            label: '--°C',
            css_classes: ['hero-temp'],
            halign: Gtk.Align.CENTER
        });

        this._descLabel = new Gtk.Label({
            label: 'Fetching conditions...',
            css_classes: ['title-4'],
            halign: Gtk.Align.CENTER
        });

        this._heroBox.append(this._locationLabel);
        this._heroBox.append(this._tempLabel);
        this._heroBox.append(this._descLabel);
        this._mainContainer.append(this._heroBox);

        // --- 2. Hourly Scroll Section ---
        const hourlyTitle = new Gtk.Label({
            label: 'Hourly Forecast',
            css_classes: ['weather-section-title'],
            halign: Gtk.Align.START
        });
        this._mainContainer.append(hourlyTitle);

        const hourlyScrolled = new Gtk.ScrolledWindow({
            vscrollbar_policy: Gtk.PolicyType.NEVER,
            hscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
            css_classes: ['hourly-box']
        });

        this._hourlyBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 4
        });
        hourlyScrolled.set_child(this._hourlyBox);
        this._mainContainer.append(hourlyScrolled);

        // --- 3. Weekly Forecast Section ---
        const weeklyTitle = new Gtk.Label({
            label: '7-Day Forecast',
            css_classes: ['weather-section-title'],
            halign: Gtk.Align.START
        });
        this._mainContainer.append(weeklyTitle);

        this._weeklyBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 0
        });
        this._mainContainer.append(this._weeklyBox);
    }

    _getWeatherDetails(code) {
        // WMO Weather interpretation codes mapping
        switch (code) {
            case 0: return { text: 'Clear Sky', icon: 'weather-clear-symbolic' };
            case 1:
            case 2:
            case 3: return { text: 'Partly Cloudy', icon: 'weather-few-clouds-symbolic' };
            case 45:
            case 48: return { text: 'Foggy', icon: 'weather-fog-symbolic' };
            case 51:
            case 53:
            case 55:
            case 56:
            case 57: return { text: 'Drizzle', icon: 'weather-showers-symbolic' };
            case 61:
            case 63:
            case 65: return { text: 'Rain Showers', icon: 'weather-rain-symbolic' };
            case 71:
            case 73:
            case 75:
            case 77: return { text: 'Snowfall', icon: 'weather-snow-symbolic' };
            case 95:
            case 96:
            case 99: return { text: 'Thunderstorm', icon: 'weather-storm-symbolic' };
            default: return { text: 'Fair', icon: 'weather-clear-symbolic' };
        }
    }

    async fetchWeatherData() {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${this._lat}&longitude=${this._lon}&current=temperature_2m,weather_code&hourly=temperature_2m,weather_code,time&daily=weather_code,temperature_2m_max,temperature_2m_min,time&timezone=auto`;
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

            const dataStr = new TextDecoder().decode(bytes.get_data ? bytes.get_data() : bytes.toArray());
            const json = JSON.parse(dataStr);

            // Update Current Weather
            if (json.current) {
                const currentTemp = Math.round(json.current.temperature_2m);
                const condition = this._getWeatherDetails(json.current.weather_code);
                this._tempLabel.set_label(`${currentTemp}°C`);
                this._descLabel.set_label(condition.text);
            }

            // Update Hourly Forecast (Next 12 hours)
            if (json.hourly && json.hourly.time) {
                let child;
                while ((child = this._hourlyBox.get_first_child()) !== null) {
                    this._hourlyBox.remove(child);
                }

                const nowIndex = new Date().getHours();
                for (let i = nowIndex; i < nowIndex + 12 && i < json.hourly.time.length; i++) {
                    const timeStr = json.hourly.time[i].split('T')[1];
                    const temp = Math.round(json.hourly.temperature_2m[i]);
                    const condition = this._getWeatherDetails(json.hourly.weather_code[i]);

                    const itemBox = new Gtk.Box({
                        orientation: Gtk.Orientation.VERTICAL,
                        css_classes: ['hourly-item'],
                        spacing: 6
                    });

                    itemBox.append(new Gtk.Label({ label: timeStr, css_classes: ['dim-label'] }));
                    itemBox.append(new Gtk.Image({ icon_name: condition.icon, pixel_size: 24 }));
                    itemBox.append(new Gtk.Label({ label: `${temp}°`, css_classes: ['temp-label'] }));

                    this._hourlyBox.append(itemBox);
                }
            }

            // Update Weekly Forecast
            if (json.daily && json.daily.time) {
                let child;
                while ((child = this._weeklyBox.get_first_child()) !== null) {
                    this._weeklyBox.remove(child);
                }

                for (let i = 0; i < json.daily.time.length; i++) {
                    const dateObj = new Date(json.daily.time[i]);
                    const dayName = i === 0 ? 'Today' : dateObj.toLocaleDateString(undefined, { weekday: 'long' });
                    const maxTemp = Math.round(json.daily.temperature_2m_max[i]);
                    const minTemp = Math.round(json.daily.temperature_2m_min[i]);
                    const condition = this._getWeatherDetails(json.daily.weather_code[i]);

                    const rowBox = new Gtk.Box({
                        orientation: Gtk.Orientation.HORIZONTAL,
                        css_classes: ['weekly-item'],
                        spacing: 16
                    });

                    const dayLabel = new Gtk.Label({ 
                        label: dayName, 
                        halign: Gtk.Align.START,
                        hexpand: true,
                        css_classes: ['temp-label']
                    });

                    const iconImage = new Gtk.Image({ 
                        icon_name: condition.icon, 
                        pixel_size: 24,
                        halign: Gtk.Align.CENTER,
                        hexpand: true
                    });

                    const tempSpan = new Gtk.Label({ 
                        label: `${maxTemp}° / ${minTemp}°C`, 
                        halign: Gtk.Align.END,
                        hexpand: true,
                        css_classes: ['dim-label']
                    });

                    rowBox.append(dayLabel);
                    rowBox.append(iconImage);
                    rowBox.append(tempSpan);
                    
                    this._weeklyBox.append(rowBox);
                }
            }

        } catch (e) {
            console.error('Failed to load Open-Meteo weather data:', e.message);
            this._descLabel.set_label('Failed to load live weather');
        }
    }
});
