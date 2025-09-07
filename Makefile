INSTALLPATH = ~/.local/share/gnome-shell/extensions/quick-paste@meeseeks.com/
MODULES = extension.js metadata.json schemas/

compile-schema:
	glib-compile-schemas --strict --targetdir=schemas/ schemas

install: compile-schema
	rm -rf $(INSTALLPATH)
	mkdir -p $(INSTALLPATH)
	cp -r $(MODULES) $(INSTALLPATH)/