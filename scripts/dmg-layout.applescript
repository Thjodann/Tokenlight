on run argv
  set mountPath to item 1 of argv
  tell application "Finder"
    set imageFolder to POSIX file mountPath as alias
    open imageFolder
    set imageWindow to container window of imageFolder
    set current view of imageWindow to icon view
    set toolbar visible of imageWindow to false
    set statusbar visible of imageWindow to false
    set bounds of imageWindow to {180, 160, 980, 548}
    set viewOptions to icon view options of imageWindow
    set arrangement of viewOptions to not arranged
    set icon size of viewOptions to 96
    set text size of viewOptions to 12
    set background picture of viewOptions to POSIX file (mountPath & "/.background/accents.tiff")
    set position of item "Tokenlight.app" of imageFolder to {190, 180}
    set position of item "Applications" of imageFolder to {610, 180}
    update imageFolder without registering applications
    delay 2
    close imageWindow
  end tell
end run
