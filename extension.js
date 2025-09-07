import GObject from 'gi://GObject';
import St from 'gi://St';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';

import { Extension, gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const Indicator = GObject.registerClass(
    class Indicator extends PanelMenu.Button {
        _init(extension) {
            super._init(0.0, _('My Shiny Indicator'));

            this.add_child(new St.Icon({
                icon_name: 'edit-paste-symbolic',
                style_class: 'system-status-icon',
            }));

            let entryItem = new PopupMenu.PopupBaseMenuItem({ reactive: false });

            let hbox = new St.BoxLayout({ vertical: false, x_expand: true });

            let label = new St.Label({ text: 'Max items: ', y_align: Clutter.ActorAlign.CENTER });
            hbox.add_child(label);

            let entry = new St.Entry({
                text: extension._MAX_ITEMS.toString(),
                style_class: 'maxitem-entry',
            });

            entry.clutter_text.connect('text-changed', () => {
                let value = parseInt(entry.get_text());
                if (!isNaN(value)) {
                    extension._MAX_ITEMS = value;

                    if (extension._clipboardHistory.length > extension._MAX_ITEMS){
                        extension._clipboardHistory.splice(extension._MAX_ITEMS);
                        extension._footer.text = `(${extension._currentIndex} - ${extension._MAX_ITEMS})`;
                    }
                }
            });

            hbox.add_child(entry);

            entryItem.actor.add_child(hbox);

            this.menu.addMenuItem(entryItem);

            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

            let disableItem = new PopupMenu.PopupMenuItem(_('Disable'));
            disableItem.connect('activate', () => {
                Main.extensionManager.disableExtension(extension.uuid);
            });
            this.menu.addMenuItem(disableItem);
        }
    });

export default class IndicatorExampleExtension extends Extension {
    enable() {
        this._selection = null;
        this._selectionOwnerChangedId = null;
        this._isMyCopy = false;
        this._MAX_ITEMS = 50;
        this._setupListener();

        this._settings = this.getSettings();

        this._indicator = new Indicator(this);
        Main.panel.addToStatusArea(this.uuid, this._indicator);

        this._keybindingName = 'ctrl-right-arrow';
        this._enableKeybinding();

        this._clipboardHistory = [];
        this._currentIndex = 0;
        this._createOverlay();
    }

    disable() {
        this._disableKeybinding();

        if (this._selection && this._selectionOwnerChangedId) {
            this._selection.disconnect(this._selectionOwnerChangedId);
            this._selectionOwnerChangedId = null;
        }
        this._selection = null;

        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }

        this._settings = null;

        this._destroyOverlay();
    }

    _enableKeybinding() {
        if (this._keybindingActive)
            return;

        const ModeType = Shell.hasOwnProperty('ActionMode') ?
            Shell.ActionMode : Shell.KeyBindingMode;

        Main.wm.addKeybinding(
            this._keybindingName,
            this._settings,
            Meta.KeyBindingFlags.NONE,
            ModeType.ALL,
            this._onKeybindingActivated.bind(this)
        );

        this._keybindingActive = true;
    }

    _disableKeybinding() {
        if (!this._keybindingActive)
            return;

        Main.wm.removeKeybinding(this._keybindingName);
        this._keybindingActive = false;
    }

    _onKeybindingActivated() {
        this._overlay.show();
        this._overlay.grab_key_focus();
        this._disableKeybinding();
    }

    _setupListener() {
        const metaDisplay = Shell.Global.get().get_display();
        const selection = metaDisplay.get_selection();

        if (!selection) {
            return;
        }

        if (this._selection && this._selectionOwnerChangedId) {
            this._selection.disconnect(this._selectionOwnerChangedId);
            this._selectionOwnerChangedId = null;
        }

        this._selection = selection;

        this._selectionOwnerChangedId = selection.connect(
            'owner-changed',
            this._onSelectionChange.bind(this)
        );
    }

    _onSelectionChange(selection, selectionType, selectionSource) {
        if (selectionType !== 1) // 1 = CLIPBOARD
            return;

        let clipboard = St.Clipboard.get_default();

        clipboard.get_text(St.ClipboardType.CLIPBOARD, (clipboard, text) => {
            if (!text || this._isMyCopy) {
                this._isMyCopy = false;
                return;
            }
            let cleanText = text.trim();

            const index = this._clipboardHistory.indexOf(cleanText);
            if (index !== -1)
                this._clipboardHistory.splice(index, 1);

            this._clipboardHistory.unshift(cleanText);

            if (this._clipboardHistory.length > this._MAX_ITEMS)
                this._clipboardHistory.pop();

            this._currentIndex = 0;
            this._label.text = this._clipboardHistory[this._currentIndex];
            this._footer.text = `(${this._currentIndex + 1} - 50)`;
        });
    }

    _createOverlay() {
        this._overlay = new St.BoxLayout({
            vertical: true,
            width: 600,
            height: 300,
            reactive: true,
            can_focus: true,
            style: 'background-color: rgba(128, 128, 128, 0.8); padding: 10px',
        });

        this._header = new St.Label({
            text: '📋 Clipboard Manager',
            style: 'background-color: rgba(50, 50, 50, 0.8); padding: 5px; border-radius: 10px; color: white; font-weight: bold; font-size: 18px; text-align: center; margin: 5px;',
            x_align: Clutter.ActorAlign.FILL
        });
        this._overlay.add_child(this._header);

        this._label = new St.Label({
            text: 'no item',
            style: 'background-color: rgba(50, 50, 50, 0.8); margin: 5px; padding: 5px; border-radius: 10px; color: white; font-size: 14px; text-align: center;',
            x_align: Clutter.ActorAlign.FILL,
            y_expand: true,
            reactive: true,
            clip_to_allocation: true
        });

        let clutterText = this._label.get_clutter_text();
        clutterText.set_line_wrap(true);
        clutterText.set_line_wrap_mode(Pango.WrapMode.WORD_CHAR);
        this._overlay.add_child(this._label);

        // Footer
        this._footer = new St.Label({
            text: '(0 - 50)',
            style: 'background-color: rgba(50, 50, 50, 0.8); margin: 5px; padding: 5px; border-radius: 10px; color: white; font-weight: bold; font-size: 16px; text-align: center;',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER
        });
        this._overlay.add_child(this._footer);


        Main.layoutManager.addChrome(this._overlay);

        const monitor = Main.layoutManager.primaryMonitor;
        this._overlay.set_position(
            Math.floor(monitor.width / 2 - this._overlay.width / 2),
            Math.floor(monitor.height / 2 - this._overlay.height / 2)
        );

        this._keyPressHandler = this._overlay.connect('key-press-event', (actor, event) => {
            const symbol = event.get_key_symbol();
            if (symbol === Clutter.KEY_Right) {
                this._nextString();
            } else if (symbol === Clutter.KEY_Left) {
                this._prevString();
            }
            return Clutter.EVENT_STOP;
        });

        this._keyReleaseHandler = this._overlay.connect('key-release-event', (actor, event) => {
            const symbol = event.get_key_symbol();

            if ((symbol === Clutter.KEY_Control_L)) {
                this._enableKeybinding();
                this._overlay.hide();

                if (!this._clipboardHistory || this._clipboardHistory.length === 0)
                    return;

                this._isMyCopy = true;
                let processCopyToClipboard = new Gio.Subprocess({
                    argv: ['sh', '-c', `echo -n ${GLib.shell_quote(this._clipboardHistory[this._currentIndex])} | wl-copy`],
                    flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
                });
                processCopyToClipboard.init(null);

                let processPaste = new Gio.Subprocess({
                    argv: ['ydotool', 'key', 'ctrl+v'],
                    flags: Gio.SubprocessFlags.NONE,
                });
                processPaste.init(null);
            }

            return Clutter.EVENT_STOP;
        });

        this._overlay.hide();
    }

    _destroyOverlay() {
        if (this._overlay) {
            if (this._keyPressHandler) {
                this._overlay.disconnect(this._keyPressHandler);
                this._keyPressHandler = null;
            }

            if (this._keyReleaseHandler) {
                this._overlay.disconnect(this._keyReleaseHandler);
                this._keyReleaseHandler = null;
            }

            Main.layoutManager.removeChrome(this._overlay);

            this._overlay.destroy();
            this._overlay = null;
            this._label = null;
            this._footer = null;
            this._header = null;
        }
    }

    _nextString() {
        if (this._currentIndex < this._clipboardHistory.length - 1) {
            this._currentIndex++;
            this._updateLabel();
        }
    }

    _prevString() {
        if (this._currentIndex > 0) {
            this._currentIndex--;
            this._updateLabel();
        }
    }

    _updateLabel() {
        if (!this._label)
            return;

        this._label.text = this._clipboardHistory[this._currentIndex];
        this._footer.text = `(${this._currentIndex + 1} - ${this._MAX_ITEMS})`;
    }

    _log(message, level) {
        const prefix = '[quickPaste]';
        switch (level) {
            case 'w':
                console.warn(`${prefix} ${message}`);
                break;
            case 'e':
                console.error(`${prefix} ${message}`);
                break;
            default:
                console.debug(`${prefix} ${message}`);
        }
    }
}
