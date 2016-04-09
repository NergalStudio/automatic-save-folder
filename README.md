# automatic-save-folder -- e10s branch
e10s branch will be used as work in progress for Electrolysis support.

e10s is a new Async method used by Firefox 40+ to access windows.content.
addons can't access windows.content directly anymore and need to use frame scripting and the message handler
to communicate asynchronously with the the interface and the content.

This branch is my current progress.
It's only to show you what I did so far.

# progress and issues
- It works with normal download and right-click download.
- It doesn't work with add/edit filter windows.
- It requires frame script to be removed after every run or it will duplicate itself. (Firefox 48 bug?)
- There's currently no way to detect if e10s is possible on Firefox. 
  It's using the "browser.tabs.remote.autostart" preference to detect if the user want to use it or not.
  This is not a viable solution in case of downgrade.
- install.rdf is set to always enable e10s. By default, it's disabled if that option is not present. 
  in the future it will be enabled by default and addons will have to explicitely set it to Disabled if not compatible.
