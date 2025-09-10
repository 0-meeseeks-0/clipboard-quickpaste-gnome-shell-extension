import GObject from 'gi://GObject';
import St from 'gi://St';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import { Keyboard } from './keyboard.js';

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
                text: extension._MAX_ITEMS.toString()
            });

            entry.clutter_text.connect('text-changed', () => {
                let value = parseInt(entry.get_text());
                if (!isNaN(value)) {
                    extension._MAX_ITEMS = value;
                    extension._currentIndex = 0;
                    extension._settings.set_int('clipboard-quickpaste-maxitems', value);

                    if (extension._clipboardHistory.length > value)
                        extension._clipboardHistory.splice(value);

                    extension._settings.set_strv('clipboard-quickpaste-history', extension._clipboardHistory)

                    if (extension._clipboardHistory.length > 0) {
                        extension._label.text = extension._clipboardHistory[extension._currentIndex];
                        extension._footer.text = `(${extension._currentIndex + 1} - ${value})`;
                    }
                    else {
                        extension._label.text = 'no items';
                        extension._footer.text = `(${extension._currentIndex} - ${value})`;
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

            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

            let emptyHistory = new PopupMenu.PopupMenuItem(_('Empty history'));
            emptyHistory.connect('activate', () => {
                extension._clipboardHistory = [];
                extension._settings.set_strv('clipboard-quickpaste-history', extension._clipboardHistory);
                extension._currentIndex = 0;
                extension._label.text = 'no items'
                extension._footer.text = `(${extension._currentIndex} - ${extension._MAX_ITEMS})`;
            });
            this.menu.addMenuItem(emptyHistory);
        }
    });

export default class IndicatorExampleExtension extends Extension {
    enable() {
        this._settings = this.getSettings('org.gnome.shell.extensions.clipboard-quickpaste');
        this._selection = null;
        this._selectionOwnerChangedId = null;
        this._isMyCopy = false;
        this._clipboard = St.Clipboard.get_default();
        this._clipboardHistory = this._settings.get_strv('clipboard-quickpaste-history');
        this._MAX_ITEMS = this._settings.get_int('clipboard-quickpaste-maxitems');
        this._currentIndex = 0;

        this._setupListener();
        this._enableKeybinding();
        this._createOverlay();

        this.keyboard = new Keyboard();

        this._indicator = new Indicator(this);
        Main.panel.addToStatusArea(this.uuid, this._indicator);
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
        this.keyboard.destroy();
    }

    _enableKeybinding() {
        if (this._keybindingActive)
            return;

        const ModeType = Shell.hasOwnProperty('ActionMode') ?
            Shell.ActionMode : Shell.KeyBindingMode;

        Main.wm.addKeybinding(
            'ctrl-right-arrow',
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

        Main.wm.removeKeybinding('ctrl-right-arrow');
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

        this._selectionOwnerChangedId = selection.connect('owner-changed', (selection, selectionType, selectionSource) => {
            this._onSelectionChange(selection, selectionType, selectionSource);
        });
    }

    _onSelectionChange(selection, selectionType, selectionSource) {
        if (selectionType !== Meta.SelectionType.SELECTION_CLIPBOARD)
            return;

        this._clipboard.get_text(St.ClipboardType.CLIPBOARD, (clipboard, text) => {
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
            this._footer.text = `(${this._currentIndex + 1} - ${this._MAX_ITEMS})`;

            this._settings.set_strv('clipboard-quickpaste-history', this._clipboardHistory);
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
            text: this._clipboardHistory.length > 0 ? this._clipboardHistory[this._currentIndex] : 'no items',
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
            text: `(${this._currentIndex + 1} - ${this._MAX_ITEMS})`,
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

            if ((symbol === Clutter.KEY_Control_L || symbol === Clutter.KEY_Control_R)) {
                this._enableKeybinding();
                this._overlay.hide();

                if (!this._clipboardHistory || this._clipboardHistory.length === 0)
                    return;

                this._isMyCopy = true;
                this._clipboard.set_text(St.ClipboardType.CLIPBOARD, this._clipboardHistory[this._currentIndex]);
                this._paste();
            }

            return Clutter.EVENT_STOP;
        });

        this._overlay.hide();
    }

    _paste() {
        if (this.keyboard.purpose === Clutter.InputContentPurpose.TERMINAL) {
            this.keyboard.press(Clutter.KEY_Control_L);
            this.keyboard.press(Clutter.KEY_Shift_L);
            this.keyboard.press(Clutter.KEY_Insert);
            this.keyboard.release(Clutter.KEY_Insert);
            this.keyboard.release(Clutter.KEY_Shift_L);
            this.keyboard.release(Clutter.KEY_Control_L);
        }
        else {
            this.keyboard.press(Clutter.KEY_Shift_L);
            this.keyboard.press(Clutter.KEY_Insert);
            this.keyboard.release(Clutter.KEY_Insert);
            this.keyboard.release(Clutter.KEY_Shift_L);
        }
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