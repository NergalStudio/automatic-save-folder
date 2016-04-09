/* ***** BEGIN LICENSE BLOCK *****
Automatic Save Folder
Copyright (C) 2007-2012 Éric Cassar (Cyan).
			  2009 Ted Gifford - Dynamic variable capturing

    "Automatic Save Folder" is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 2 of the License, or
    (at your option) any later version.

    "Automatic Save Folder" is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with "Automatic Save Folder".  If not, see <http://www.gnu.org/licenses/>.

 * ***** END LICENSE BLOCK ***** */
 var automatic_save_folder = {
		prefManager: Components.classes["@mozilla.org/preferences-service;1"]
                        .getService(Components.interfaces.nsIPrefBranch),
						
		appInfo: Components.classes["@mozilla.org/xre/app-info;1"]
                        .getService(Components.interfaces.nsIXULAppInfo),
						
		versionChecker: Components.classes["@mozilla.org/xpcom/version-comparator;1"]
                               .getService(Components.interfaces.nsIVersionComparator),
				
		firefoxversion : "",
		systemslash: "",
		logtoconsole: true,
		inPrivateBrowsing: false,
		result: "", // print_r result
		matching_filters: new Array(),
		matching_folders: new Array(),
		current_uri: "", // FF7.0.1 use a new per uri saved folder.
		current_uri_lastpath: "", // last stored path for that uri
		
	main: function () {


		// Setting private variables usable in this function
		var prefManager = automatic_save_folder.prefManager;
		var versionChecker = automatic_save_folder.versionChecker;
		var appInfo = automatic_save_folder.appInfo;
		this.checkFirefoxVersion();
		
		// Load Window and tab elements from the current active browser.
		var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
						   .getService(Components.interfaces.nsIWindowMediator);
		var mainWindow = wm.getMostRecentWindow("navigator:browser");
		var currentTab = mainWindow.gBrowser.getBrowserAtIndex(mainWindow.gBrowser.tabContainer.selectedIndex);
		
		// Check if the user is in PrivateBrowsing mode.
		if (this.versionChecker.compare(this.appInfo.version, "3.5") >= 0)// nsIPrivateBrowsingService supported from FF3.5 to FF20
		{
			
			// Firefox 3.5 to 20.x
			if(this.versionChecker.compare(this.appInfo.version, "21.0") < 0)
			{
				var pbs = Components.classes["@mozilla.org/privatebrowsing;1"]
									.getService(Components.interfaces.nsIPrivateBrowsingService);
				this.inPrivateBrowsing = pbs.privateBrowsingEnabled;						
			}
			
			// Firefox 21 to 31
			if(this.versionChecker.compare(this.appInfo.version, "21.0") >= 0 &&
				this.versionChecker.compare(this.appInfo.version, "32.0") < 0)
			{
				this.inPrivateBrowsing = mainWindow.gBrowser.docShell.QueryInterface(Components.interfaces.nsILoadContext).usePrivateBrowsing;
			}
			
			// Firefox 32 and newer (tested up to 43)
			if(this.versionChecker.compare(this.appInfo.version, "32.0") >= 0)
			{
				try
				{
					var PBU = {};
					Components.utils.import("resource://gre/modules/PrivateBrowsingUtils.jsm", PBU);
				
					if (PBU.PrivateBrowsingUtils.isWindowPrivate(window)) 
					{
						this.inPrivateBrowsing = true;
					}
				}
				catch(e)
				{
					this.inPrivateBrowsing = false;
				}
			}
			
			Components.utils.import("resource://gre/modules/DownloadLastDir.jsm");
			
			// since 2012-07-21 gDownloadLastDir uses a per-window privacy status instead of global service. (https://bugzilla.mozilla.org/show_bug.cgi?id=722995 ; https://hg.mozilla.org/mozilla-central/rev/03cd2ad254cc)
			if (typeof(gDownloadLastDir) != "object")
			{
				var gDownloadLastDir = {}; // Create the gDownloadLastDir object because it doesn't exist
				var downloadModule = {};
				Components.utils.import("resource://gre/modules/DownloadLastDir.jsm", downloadModule);
				gDownloadLastDir = new downloadModule.DownloadLastDir(mainWindow); // Load gDownloadLastDir for the active window
			}
		}
		
		/* load the domain and the filename of the saved file (copy the data from the firefox saving window and from the last active tab) */	
		// var tabLocation = currentTab.currentURI.spec;
		var tabLocation = mainWindow.gBrowser.mCurrentTab.linkedBrowser.contentDocument.location;
		var tabURL = mainWindow.gURLBar.value;
		var tabGroupName = this.getActiveGroupName();
		var currentReferrer = mainWindow.gBrowser.mCurrentTab.linkedBrowser.contentDocument.referrer;
			
		var filename = 			document.getElementById("location").value ;
		
		var domain = 			document.getElementById("source").value ;
		var	domainWithoutProtocol = domain.replace(/^.*:\/\//g,'');  // remove the protocol name from the domain
		var fileURL = 			document.getElementById("source").getAttribute("tooltiptext");
		var fileURLAndFilename= document.getElementById("source").getAttribute("tooltiptext") + filename;
		var currentDomain, currentURL = "";
		currentDomain = 	tabLocation.protocol + "//" + tabLocation.host; // look for the current website URL in the DOM.
		currentURL = 		tabLocation.href; // look for the current website URL in the DOM.
		if (currentDomain == "about://") currentDomain = "";

		if (this.firefoxversion >= 7.01) 
		{
			this.current_uri = domain.replace(/^.*:\/\//g,'');
			if (this.current_uri == "") this.current_uri = tabLocation.href; // fix website opening a new about:blank page when clicking on a download link, and that tab is not auto-closing.
			
			// read lastpath for that uri
			var uri = this.current_uri;
			var file = gDownloadLastDir.getFile(uri);
			if (file != null) this.current_uri_lastpath = file.path;
		}
		
		var domain_testOrder = prefManager.getCharPref("extensions.asf.domainTestOrder");
		if (this.trim(domain_testOrder) == "") domain_testOrder = "1,5";
		var message = "These data will be used to verify the filters :\n"+
							"Filename:\t\t"+filename+"\nDomain test order:\t"+domain_testOrder+"\n"+
							"1 - File's domain:\t"+domain+"\n"+
							"2 - File's URL:\t\t"+fileURL+"\n"+
							"3 - Full file's URL:\t"+fileURLAndFilename+"\n"+
							"4 - Page's domain:\t"+currentDomain+"\n"+
							"5 - Page's URL:\t\t"+currentURL+"\n"+
							"6 - Page's referrer:\t"+currentReferrer+"\n"+
							"7 - Tab's URL content:\t"+tabURL+"\n"+
							"8 - Tab's group name:\t"+tabGroupName;
		if (!this.inPrivateBrowsing) this.console_print(message);
		// debug : show the full downloaded link  http://abc.xyz/def/file.ext
		// Can use this new function to get free from the need of the download window.
		//var url = dialog.mLauncher.source.spec;
		//alert(url);
		
		
		
		
		// load prefmanager data
		var savetype = 				prefManager.getIntPref("extensions.asf.savetype");
		var lastdir = 				prefManager.getBoolPref("extensions.asf.lastdir");	     // for Firefox2 : set save as Ctrl+S too
		var defaultfolder = 		this.loadUnicodeString("extensions.asf.defaultfolder");
		var keeptemp = 				prefManager.getBoolPref("extensions.asf.keeptemp");
		var tempdomain = 			this.loadUnicodeString("extensions.asf.tempdomain");      // hosted domain from last saved file
		var variable_mode = 		prefManager.getBoolPref("extensions.asf.variablemode");  // enable Variables in folder creation (dynamic Folders)
		var dialogaccept = 			prefManager.getBoolPref("extensions.asf.dialogaccept");
		var dialogacceptFiltered = 	prefManager.getBoolPref("extensions.asf.dialogacceptFiltered");
		var suggestAllPossibleFolders = prefManager.getBoolPref("extensions.asf.suggestAllPossibleFolders");
		var findNearestParent = 	prefManager.getBoolPref("extensions.asf.findNearestParent");
		
		// If variable/Dynamic folders mode is ON, let's replace the variables to create the new defaultfolder
		if (variable_mode == true)
		{
			defaultfolder = this.createfolder(defaultfolder);
		}
		
		// set the last saved path into asf.lastpath
		if (this.firefoxversion >= 3)   // take the download.lastDir if it's FF3
		{
			var folder = this.loadUnicodeString("browser.download.lastDir");
		}
		else // else if it's not FF3 (it's 1.5 or 2), read Download.dir
		{
			var folder = this.loadUnicodeString("browser.download.dir");
		}
		this.saveUnicodeString("extensions.asf.lastpath", folder); // And set it to asf.lastpath to be compared later with the new path the filters will set to lastDir (or dir)
		
		
		// load filters data from prefmanager into filters[]
		// filters[filternumber][label]
		var nbrfilters = 	prefManager.getIntPref("extensions.asf.filtersNumber");
		var filters = new Array();
		for ( var i = 0 ; i < nbrfilters ; i++)
		{
			var dom = this.loadUnicodeString("extensions.asf.filters"+ i +".domain");
			var fil = this.loadUnicodeString("extensions.asf.filters"+ i +".filename");
			var fol = this.loadUnicodeString("extensions.asf.filters"+ i +".folder");
			var act = prefManager.getBoolPref("extensions.asf.filters"+ i +".active");
			var dom_reg = prefManager.getBoolPref("extensions.asf.filters"+ i +".domain_regexp");
			var fil_reg = prefManager.getBoolPref("extensions.asf.filters"+ i +".filename_regexp");
			filters[i] = [dom, fil, fol, act, dom_reg, fil_reg];
		}
		
		
		//
		// Start checking the filters with the downloaded file
		//
		var idx = -1 ;
		var dom_regexp = false;
		var file_regexp = false;
		while(this.matching_filters.length) this.matching_filters.pop(); // reset the matching filters array
		for ( var i = 0 ; i < filters.length ; i++)
		{
			if (filters[i][3] == true)  // if not temporary deactivated
			{
				dom_regexp = false ; // reset the matching string for the "for" loop
				file_regexp = false ; // same as above
			// Check the domain
				var domain_testOrder = prefManager.getCharPref("extensions.asf.domainTestOrder");
				if (this.trim(domain_testOrder) == "") domain_testOrder = "1,5";
				domain_testOrder = domain_testOrder.split(/,/);
				
				for ( var j = 0 ; j < domain_testOrder.length ; j++)
				{
					switch (this.trim(domain_testOrder[j])) 
					{
						case "1":
							dom_regexp = this.test_regexp(filters[i][0], domain, i, "domain");
							if (dom_regexp && this.logtoconsole && !this.inPrivateBrowsing) this.console_print("Filter "+i+" matched domain type : 1");
							break;
						case "2":
							dom_regexp = this.test_regexp(filters[i][0], fileURL, i, "domain");
							if (dom_regexp && this.logtoconsole && !this.inPrivateBrowsing) this.console_print("Filter "+i+" matched domain type : 2");
							break;
						case "3":
							dom_regexp = this.test_regexp(filters[i][0], fileURLAndFilename, i, "domain");
							if (dom_regexp && this.logtoconsole && !this.inPrivateBrowsing) this.console_print("Filter "+i+" matched domain type : 3");
							break;
						case "4":
							dom_regexp = this.test_regexp(filters[i][0], currentDomain, i, "domain");
							if (dom_regexp && this.logtoconsole && !this.inPrivateBrowsing) this.console_print("Filter "+i+" matched domain type : 4");
							break;
						case "5":
							dom_regexp = this.test_regexp(filters[i][0], currentURL, i, "domain");
							if (dom_regexp && this.logtoconsole && !this.inPrivateBrowsing) this.console_print("Filter "+i+" matched domain type : 5");
							break;
						case "6":
							dom_regexp = this.test_regexp(filters[i][0], currentReferrer, i, "domain");
							if (dom_regexp && this.logtoconsole && !this.inPrivateBrowsing) this.console_print("Filter "+i+" matched domain type : 6");
							break;
						case "7":
							dom_regexp = this.test_regexp(filters[i][0], tabURL, i, "domain");
							if (dom_regexp && this.logtoconsole && !this.inPrivateBrowsing) this.console_print("Filter "+i+" matched domain type : 7");
							break;
						case "8":
							dom_regexp = this.test_regexp(filters[i][0], tabGroupName, i, "domain");
							if (dom_regexp && this.logtoconsole && !this.inPrivateBrowsing) this.console_print("Filter "+i+" matched domain type : 8");
							break;
						default:
					}
					
					if (dom_regexp) break;
				}
				
			// Check the filename
				file_regexp = this.test_regexp(filters[i][1], filename, i, "filename"); // Filename
				
				// debug
				// alert ("i = "+i+"\n domain match = "+dom_regexp+"\n file match = "+file_regexp);
				if (dom_regexp && file_regexp)
				{
					idx = i;
					this.matching_filters.push(idx); // add the matching filter to the array
					if (this.logtoconsole && !this.inPrivateBrowsing)  this.console_print("Filter "+idx+" is matching both domain and filename.\nDomain:\t\t"+filters[i][0]+"\nFilename:\t"+filters[i][1]+"\nFolder:\t\t"+filters[i][2]);
					if (suggestAllPossibleFolders == false) break;
				}
			}
		} // end filters loop
		
		if (idx < 0) // if no filters matched
		{
			if (this.logtoconsole && !this.inPrivateBrowsing)  this.console_print("No filter matched both domain and filename. These data will be used instead :\nFolder:\t\t"+this.loadUnicodeString("extensions.asf.defaultfolder")+"\n%asf_d%:\t"+domainWithoutProtocol+"\n%asf_f%:\t"+filename);
			
			if(savetype == 1)  // and folder is set to user choice
			{
				if ( (keeptemp == false) || ((keeptemp == true) && ( tempdomain != domain )) ) // and, if [same domain not checked] OR [ if same domain (keeptemp) is checked and domain not same as previous one]
				{	
					// then change the destination folder to user choice
					this.set_savepath(defaultfolder);
				}
				else  // else, if domain is the same as the last, and the user checked "use the same folder if same domain"
				{
					if (this.firefoxversion >= 3)
					{
						var lastpath = this.loadUnicodeString("browser.download.lastDir");
					}
					if (this.firefoxversion == 2)
					{
						var lastpath = this.loadUnicodeString("browser.download.dir");
					}
					
					if (lastpath == "") // if no path is returned (first time using lastDir, or the user reseted the content manually in about:config)
					{
						lastpath = defaultfolder;
					}
					this.set_savepath(lastpath);
				}
			}
			else // else, if savetype == 0  (folder is set to last folder)
			{
				if (this.firefoxversion >= 3)
				{
					var lastpath = this.loadUnicodeString("browser.download.lastDir");
				}
				if (this.firefoxversion == 2)
				{
					var lastpath = this.loadUnicodeString("browser.download.dir");
				}
				
				if (lastpath == "") // if no path is returned (first time using lastDir, or the user reseted the content manually in about:config)
				{
					lastpath = defaultfolder;
				}
				if (this.firefoxversion >= 7.01 && this.prefManager.getBoolPref("extensions.asf.useSiteBySiteSavePath") == true)
				{
					var file = gDownloadLastDir.getFile(this.current_uri);
					if (file != null) lastpath = file.path;
				}
				if (findNearestParent) lastpath = this.find_nearestParent(lastpath);
				this.set_savepath(lastpath);
			}
		}
		else // if a filter is found
		{
			for (var i = 0; i < this.matching_filters.length ; i++)
			{
				var idx = this.matching_filters[i];
				var folder = filters[idx][2];
				
				// If Advanced mode is ON, let's check the variables and create the folder
				if (variable_mode == true)
				{
					folder = this.createfolder(folder, idx);
				}
				
				// Check is the save path is already in the list, if present don't add it again.
				if (this.indexInArray(this.matching_folders, folder) == -1) this.matching_folders[i] = folder;
			}
			
			this.set_savepath(this.matching_folders[0]); // set the default folder to the first matching filter
		}
		
		// in every case, set the new file hosted domain to tempdomain if not in private browsing
		if (!this.inPrivateBrowsing)
		{
			this.saveUnicodeString("extensions.asf.tempdomain", domain);
		}
		
		// Set the FileExplorer display status here.
		var useDownloadDirFiltered = this.prefManager.getBoolPref("extensions.asf.useDownloadDirFiltered");
		if (useDownloadDirFiltered && idx < 0) this.prefManager.setBoolPref("browser.download.useDownloadDir", false); // no filter matched, enable the File Explorer if chosen by the user.
		else
		{
			var useDownloadDir = this.prefManager.getBoolPref("extensions.asf.useDownloadDir");
			this.prefManager.setBoolPref("browser.download.useDownloadDir", useDownloadDir);
		}
		
		// Automatic saving when clicking on a link. The save dialog still flash onscreen very quickly.
		if (dialogacceptFiltered && idx < 0) dialogaccept = false; // no filter matched, do not autoaccept the dialog
		if (dialogaccept)
		{
			// select "Save file" automatically
			if (this.prefManager.getBoolPref("extensions.asf.dialogForceRadio"))
			{
				var radioSavemode = document.getElementById("mode");
				var forceRadioTo = this.prefManager.getCharPref("extensions.asf.dialogForceRadioTo");
				var dta_ASFtoDTA_isActive = this.prefManager.getBoolPref("extensions.asf.dta_ASFtoDTA_isActive");
				if (!this.DownThemAll_isEnabled() && (forceRadioTo == "downthemall" || forceRadioTo == "turbodta")) forceRadioTo = "save"; // default to "Save File" if DTA is uninstalled.
				if (this.DownThemAll_isEnabled() && (!dta_ASFtoDTA_isActive) && (document.getElementById("tdta").hidden == true) && (forceRadioTo == "turbodta")) forceRadioTo = "downthemall"; // default to "DownThemAll" if DTA is installed but extension.dta.directory is empty.
				radioSavemode.selectedItem = document.getElementById(forceRadioTo);
				//alert(document.getElementById("turbodta").selected);
			}
			
			if (this.DownThemAll_isEnabled() && (document.getElementById("downthemall").selected || document.getElementById("turbodta").selected))
			{
				if (typeof (DTA_SaveAs) != "undefined") // dTa 1.x
				{
					DTA_SaveAs.dialogAccepted();
				}
				else // dTa 2.x
				{
					window.close();
					this.DTA_acceptDownload(document.getElementById("turbodta").selected);
				}
			}
			else
			{
				window.close();
				return dialog.onOK();
			}
		}
		else
		{
			// show or hide the asf option on saving window
			this.show_dloptions();
			this.check_uCTOption(true);
			
			var radioSavemode = document.getElementById("mode");
			radioSavemode.addEventListener(
			"command",		// After a save mode change (save, open, etc.)
			function(){ automatic_save_folder.check_uCTOption(); },  // show/hide and enable/disable ASF.
			false
			);
		}
		
	return false;
	},
	
	
	set_savepath: function(path) {
		var folderList = this.prefManager.getIntPref("browser.download.folderList");
		var lastdir = this.prefManager.getBoolPref("extensions.asf.lastdir");	     // for Firefox2 : set save as Ctrl+S too		
		var directory = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsILocalFile);		
		
		// since 2012-07-21 gDownloadLastDir uses a per-window privacy status instead of global service.
		if (this.versionChecker.compare(this.appInfo.version, "3.5") >= 0 && typeof(gDownloadLastDir) != "object")
		{
			var downloadModule = {};
			var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
							   .getService(Components.interfaces.nsIWindowMediator);
			var mainWindow = wm.getMostRecentWindow("navigator:browser");
			Components.utils.import("resource://gre/modules/DownloadLastDir.jsm", downloadModule);
			gDownloadLastDir = new downloadModule.DownloadLastDir(mainWindow);
		}
		
		// Check if the user use the "useDownloadDir" setting to automatically save to "desktop" or "downloads" and force the suggested path to those folders instead of filtered path
		if ( (folderList == 0) || (folderList == 1) )
		{
			var desk = Components.classes["@mozilla.org/file/directory_service;1"]
								.getService(Components.interfaces.nsIProperties)
								.get("Desk", Components.interfaces.nsILocalFile);
			directory = desk;
			if (this.firefoxversion >= 3)
			{
				var dnldMgr = Components.classes["@mozilla.org/download-manager;1"]
									.getService(Components.interfaces.nsIDownloadManager);
				var supportDownloadLabel = !dnldMgr.defaultDownloadsDirectory.equals(desk);
				
				if ( (folderList == 0) || (folderList == 1 && !supportDownloadLabel) ) // if desktop or if OS doesn't support default Download dir
				{
					directory = desk;
				}
				if (folderList == 1 && supportDownloadLabel) // default Downloads folder
				{
					directory.initWithPath(dnldMgr.defaultDownloadsDirectory.path);
				}
			}
		}
		else if ( (folderList == 2) && (!path) )   // set to filters but no path is define (either no default folder is set, or first time using 'folderList=2' )
		{
			directory = Components.classes["@mozilla.org/file/directory_service;1"]
								.getService(Components.interfaces.nsIProperties)
								.get("Desk", Components.interfaces.nsILocalFile);
		}
		else
		{
			directory.initWithPath(path);
		}
		
		if (this.firefoxversion == 2)
		{
		
			this.saveUnicodeString("browser.download.dir", directory.path);
			if (lastdir)
			this.saveUnicodeString("browser.download.lastDir", directory.path);
		}
		
		if (this.firefoxversion >= 3)
		{
			if (this.inPrivateBrowsing && directory)
			{
				gDownloadLastDir.file = directory;
			}
			else
			{
				this.saveUnicodeString("browser.download.lastDir", directory.path);
				if (folderList == 2)
					this.saveUnicodeString("browser.download.dir", directory.path);
				
				
				// and process DTA if enabled
				if (this.DownThemAll_isEnabled() && this.prefManager.getBoolPref("extensions.asf.dta_ASFtoDTA_isActive"))
				{
					this.DTA_replaceDirectory(directory.path);
					// If process turbo dta too
					this.DTA_setTurboDtaList();
				}
			}
			
		}
		
		if (this.firefoxversion >= 7.01)
		{
			// Firefox 7.0.1 use a new feature to memorize last used folder on a site-by-site basis.
			// Replace the memorized folder for the current website's URI.
			var uri = this.current_uri;
			// var file = gDownloadLastDir.getFile(uri);
			// alert("uri="+uri+"\noldpath ="+file.path+"\nnewpath ="+directory.path);
			gDownloadLastDir.setFile(uri, directory);
		}
		
		
		if (this.logtoconsole && !this.inPrivateBrowsing) this.console_print("save location for "+uri+" changed to: "+directory.path);
	},
	
	
	loadUnicodeString: function (pref_place) {
		try
		{
			return this.prefManager.getComplexValue(pref_place, Components.interfaces.nsISupportsString).data;
		}
		catch (e)
		{ }
		return "";
	},
	
	
	saveUnicodeString: function (pref_place,pref_data) {
		var str = Components.classes["@mozilla.org/supports-string;1"]
					.createInstance(Components.interfaces.nsISupportsString);
		str.data = pref_data;
		this.prefManager.setComplexValue(pref_place, Components.interfaces.nsISupportsString, str);
	},
	
	
	find_nearestParent: function(path) {
	
		/* test if the path exists. If it doesn't exist then returns first existing parent. */
		var directory = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsILocalFile);
		directory.initWithPath(path);
		while (!directory.exists() && directory.parent != null)
		{
			directory = directory.parent;
		}
		return directory.path;
	},
	
	
	createfolder: function (path, idx) {
		
		if (!path) return false;
		if (this.trim(path).length==0) return false;
		
		var Date_asf = Date;
		Date_asf.prototype.getWeek = function() // Add the getWeek() function do date()
		{
			var onejan = new Date(this.getFullYear(),0,1);
			var week = Math.ceil((((this - onejan) / 86400000) + onejan.getDay()-1)/7);
			if (onejan.getDay() > 4) week--;  // if the first week does not contain a thrusday, it's not the first week (and return as week 0)
			return week;
		}
		var objdate = new Date_asf();
		
		// make the array with the month's name in the stringbundle of the locale language path.
		
		var stringbundle = Components.classes['@mozilla.org/intl/stringbundle;1'].
											getService(Components.interfaces.nsIStringBundleService).
                           createBundle('chrome://asf/locale/asf.properties');
		
		var fullmonthname = new Array();
		var abbrmonthname = new Array();
		var fulldayname = new Array();
		var abbrdayname = new Array();
		for (var i = 1 ; i<= 12 ; i++)
		{
			fullmonthname[i-1] = stringbundle.GetStringFromName("month"+i+"_full");
			abbrmonthname[i-1] = stringbundle.GetStringFromName("month"+i+"_abbr");
		}
		for (var i = 0 ; i<= 6 ; i++)
		{
			fulldayname[i] = stringbundle.GetStringFromName("day"+i+"_full");
			abbrdayname[i] = stringbundle.GetStringFromName("day"+i+"_abbr");
		}
		
		
		const ZERO = "0";  // leading zero
		
		// load the domain and the filename of the saved file
		var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
						   .getService(Components.interfaces.nsIWindowMediator);
		var mainWindow = wm.getMostRecentWindow("navigator:browser");
		
		var currentTab = mainWindow.gBrowser.getBrowserAtIndex(mainWindow.gBrowser.tabContainer.selectedIndex);
		// var tabLocation = currentTab.currentURI.spec;
		var tabLocation = mainWindow.gBrowser.mCurrentTab.linkedBrowser.contentDocument.location;
		var tabURL = mainWindow.gURLBar.value;
		var tabGroupName = this.getActiveGroupName();
		var currentReferrer = mainWindow.gBrowser.mCurrentTab.linkedBrowser.contentDocument.referrer;
		
		var filename =			document.getElementById("location").value ;
		var file_name =			filename.replace (/\.(?!.*\.).*$/i, "");  // Trim from the last dot to the end of the file = remove extension
		var extension =			filename.match(/([^\.]*)$/i);  // take out the extension (anything not containing a dot, with an ending line)
		var domain =			document.getElementById("source").value ;
		var	domainWithoutProtocol = domain.replace(/^.*:\/\//g,'');  // remove the protocol name from the domain
		var fileURL =			document.getElementById("source").getAttribute("tooltiptext");
		var fileURLAndFilename= document.getElementById("source").getAttribute("tooltiptext") + filename;
		var currentDomain, currentURL = "";
		currentDomain = 	tabLocation.protocol + "//" + tabLocation.host; // look for the current website URL in the DOM.
		currentURL = 		tabLocation.href; // look for the current website URL in the DOM.
		if (currentDomain == "about://") currentDomain = "";
		
		// check the filter's data
		var asf_domain = "";
		var asf_filename = "";
		if (idx >= 0)  // If a filter match
		{
			asf_domain = this.loadUnicodeString("extensions.asf.filters"+ idx +".domain");
			asf_filename = this.loadUnicodeString("extensions.asf.filters"+ idx +".filename");
		}
		else // no filter is found, use actual Domain and filename without extension
		{
			asf_domain = domainWithoutProtocol;
			asf_filename = filename;
		}
		
		
		// Check the domain
		var used_domain_string = "";
		var dom_regexp = false;
		var domain_testOrder = this.prefManager.getCharPref("extensions.asf.domainTestOrder");
		if (this.trim(domain_testOrder) == "") domain_testOrder = "1,5";
		domain_testOrder = domain_testOrder.split(/,/);
		
		for ( var j = 0 ; j < domain_testOrder.length ; j++)
		{
			switch (this.trim(domain_testOrder[j])) 
			{
				case "1":
					dom_regexp = this.test_regexp(asf_domain, domain, idx, "domain");
					used_domain_string = domain;
					break;
				case "2":
					dom_regexp = this.test_regexp(asf_domain, fileURL, idx, "domain");
					used_domain_string = fileURL;
					break;
				case "3":
					dom_regexp = this.test_regexp(asf_domain, fileURLAndFilename, idx, "domain");
					used_domain_string = fileURLAndFilename;
					break;
				case "4":
					dom_regexp = this.test_regexp(asf_domain, currentDomain, idx, "domain");
					used_domain_string = currentDomain;
					break;
				case "5":
					dom_regexp = this.test_regexp(asf_domain, currentURL, idx, "domain");
					used_domain_string = currentURL;
					break;
				case "6":
					dom_regexp = this.test_regexp(asf_domain, currentReferrer, idx, "domain");
					used_domain_string = currentReferrer;
					break;
				case "7":
					dom_regexp = this.test_regexp(asf_domain, tabURL, idx, "domain");
					used_domain_string = tabURL;
					break;
				case "8":
					dom_regexp = this.test_regexp(asf_domain, tabGroupName, idx, "domain");
					used_domain_string = tabGroupName;
					break;
				default:
			}
			
			if (dom_regexp) break;
		}
		
		// check the filename
		var file_regexp = this.test_regexp(asf_filename, filename, idx, "filename");
		
// Ted Gifford, start block
		// String capture in filename with $<1-9>f
		try {
		//alert(file_regexp.length);
			if (file_regexp.length > 1)
			{
				//alert('munging path: ' + path);
				for (var replace_index = 1; replace_index < file_regexp.length; ++replace_index)
						path = path.replace("$"+replace_index+"f", file_regexp[replace_index]);
				//alert('munged path: ' + path);
			}
		} catch (e) {alert(e);}
		// String capture in domain with $<1-9>d
		try {
		//alert(dom_regexp.length);
			if (dom_regexp.length > 1)
			{
				//alert('munging path: ' + path);
				for (var replace_index = 1; replace_index < dom_regexp.length; ++replace_index)
						path = path.replace("$"+replace_index+"d", dom_regexp[replace_index]);
				//alert('munged path: ' + path);
			}
		} catch (e) {alert(e);}
// Ted Gifford, end block
		
		
		// read the userpref to define if regexp is case insensitive (default true)
		var param = "";
		var regexp_caseinsensitive = this.prefManager.getBoolPref("extensions.asf.regexp_caseinsensitive");
		if (regexp_caseinsensitive) param = "i";
		
		// Check if asf_rd is present and process     asf_rd = Regexp the domain
		if (path.search("%asf_rd%") != -1)
		{
			// extract the filter part
			var matches = path.match(/%asf_rd%.*?%asf_rd%/g);        // matches is an array
			if (matches != null)
			{
				var datareg = "";
				var result = new Array();
				var matchreplace = new Array();
				for (var i = 0, len = matches.length; i < len; i++)
				{
					datareg = matches[i].replace(/%asf_rd%/g, '');  // remove the %asf_rf% to keep only the regexp
					datareg = new RegExp(datareg, param);			//  create the regexp
					//alert("reg="+datareg);
					result = used_domain_string.match(datareg);    // Check it on the domain type set by the user
					
					if (result == null)
					{
						matchreplace[i] = ""; // if no result, replace with nothing instead of null
					}
					else
					{
						matchreplace[i] = result[0];
					}
					//alert("matchreplace["+i+"]="+matchreplace[i]);
				}
				for (var i = 0, len = matches.length; i < len; i++)
				{
					path = path.replace(matches[i], matchreplace[i]);  // replace each variable in the path
				}
			}
		}
		
		
		// Check if asf_rf is present and process     asf_rf = Regexp the filename
		if (path.search("%asf_rf%") != -1 )
		{
			// extract the filter part
			var matches = path.match(/%asf_rf%.*?%asf_rf%/g);        // matches is an array
			if (matches != null)
			{
				var datareg = "";
				var result = new Array();
				var matchreplace = new Array();
				for (var i = 0, len = matches.length; i < len; i++)
				{
					datareg = matches[i].replace(/%asf_rf%/g, '');  // remove the %asf_rf% to keep only the regexp
					datareg = new RegExp(datareg, param);			//  create the regexp
					//alert("reg="+datareg);
					result = filename.match(datareg);    // Check it
					
					if (result == null)
					{
						matchreplace[i] = ""; // if no result, replace with nothing instead of null
					}
					else
					{
						matchreplace[i] = result[0];
					}
					//alert("matchreplace["+i+"]="+matchreplace[i]);
				}
				for (var i = 0, len = matches.length; i < len; i++)
				{
					path = path.replace(matches[i], matchreplace[i]);  // replace each variable in the path
				}
			}
		}
		
		
		
		// remove special characters from filters :
		// forbidden on windows  \ / : * ? " < > |
		
		if (navigator.appVersion.indexOf("Win")!=-1) // = Windows
		{
			asf_domain = asf_domain.replace(/[\/\:\*\?\"\<\>\|]/g,'');
			asf_filename = asf_filename.replace(/[\/\:\*\?\"\<\>\|]/g,'');
			file_name = file_name.replace(/[\/\:\*\?\"\<\>\|]/g,'');
			path = path.replace(/\//g,'\\'); // if the user captured subdomains, then replace them with windows' sub-folders
			path = path.replace(/[\*\?\"\<\>\|]/g,'');
		}
		else  // MacOS and linux, replace only  / :
		{
			asf_domain = asf_domain.replace(/[\/\:]/g,'');
			asf_filename = asf_filename.replace(/[\/\:]/g,'');
			file_name = file_name.replace(/[\/\:]/g,'');
			
			// Do I need to replace subdomains "/" by sub-folders ":" for Mac?
		}
		
		// replace the string here		// Year
			path = path					.replace(/%Y%/g, objdate.getFullYear())  // full year format = 2009
										.replace(/%y%/g, ((objdate.getYear()-100) <10) ? (ZERO + (objdate.getYear()-100)) : objdate.getYear()-100)  // year in YY format : 08, 09, 10
									//	.replace(/%<to define>/g, objdate.getYear()-100)  // 8, 9, 10, (no leading 0)
										// Month
										.replace(/%m%/g, ((objdate.getMonth()+1) <10) ? (ZERO + (objdate.getMonth()+1)) : objdate.getMonth()+1)  // = number of the month : 01 to 12
										.replace(/%n%/g, objdate.getMonth()+1)  // 8, 9, 10, (no leading 0)
										.replace(/%F%/g, fullmonthname[objdate.getMonth()])  // full month name
										.replace(/%M%/g, abbrmonthname[objdate.getMonth()])  // abbreviated month name
										// Week
										.replace(/%W%/g, ((objdate.getWeek()) <10) ? (ZERO + (objdate.getWeek())) : objdate.getWeek())  // = number of the week : 01 to 54
										.replace(/%w%/g, objdate.getDay())  // = Day of the week, from 0 (sunday) to 6 (saturday)
										.replace(/%l%/g, fulldayname[objdate.getDay()])  // = Full day name
										.replace(/%D%/g, abbrdayname[objdate.getDay()])  // = Abbreviated day name
										// Day
										.replace(/%d%/g, ((objdate.getDate()) <10) ? (ZERO + (objdate.getDate())) : objdate.getDate())  // = number of the day : 01 to 31
										.replace(/%j%/g, objdate.getDate())  // = number of the day  1 to 31 (no leading 0)
										// ASF
										.replace(/%asf_D%/g, domainWithoutProtocol)       // downloaded File's domain
										.replace(/%asf_F%/g, filename)     // downloaded File's filename with extension
										.replace(/%asf_Fx%/g, file_name)   // downloaded File's filename without extension
										.replace(/%asf_d%/g, asf_domain)   // matching filter's Domain (without special chars used by regexp)
										.replace(/%asf_f%/g, asf_filename) // mathching filter's filename (without special chars used by regexp)
										.replace(/%asf_x%/g, extension[0]);    // match the filename extension (without the dot)
		// debug
		// alert (path);
		return path;
		
// Canceled the folder creation script, so the folder will not be created if the user cancel the download
// Firefox will create it automatically when accepting the download... under windows XP and Linux Ubuntu at least (not tested under Vista, MacOS, or any other operating system)
/*
		var directory = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsILocalFile);
		
		directory.initWithPath(path);
		if (directory.exists())
		{
			return path;
		}
		else  // if it doesn't exist, create it
		{
			if( !directory.exists() || !directory.isDirectory() )
			{
				directory.create(Components.interfaces.nsIFile.DIRECTORY_TYPE, 0777);
			}
			return path;
		}
*/
	},
	
	
	trim: function (string) {
		return string.replace(/(^\s*)|(\s*$)/g,'');
	},
	
	
	show_dloptions: function () {
		// read asf/content/info_save_ff2-3.txt for differences between Firefox 2 and Firefox 3 saving preferences.
		var asf_dloptions = document.getElementById('asf_dloptions');
		var asf_radiogroup_pathselect = document.getElementById('asf_radiogroup_pathselect');
		var asf_lastpath = document.getElementById('asf_lastpath');
		var asf_currentURI_lastpath = document.getElementById('asf_currentURI_lastpath');
		var asf_savefolder = document.getElementById('asf_savefolder');
		var asf_folder_list = document.getElementById('asf_folder_list');
		var asf_viewdloption = this.prefManager.getBoolPref("extensions.asf.viewdloption");
		var asf_viewdloptionType = this.prefManager.getIntPref("extensions.asf.viewdloptionType");
		var asf_viewpathselect = this.prefManager.getBoolPref("extensions.asf.viewpathselect");
		var useDownloadDir = this.prefManager.getBoolPref("browser.download.useDownloadDir");
		var folderList = this.prefManager.getIntPref("browser.download.folderList");
		var stringbundle = Components.classes['@mozilla.org/intl/stringbundle;1']
									 .getService(Components.interfaces.nsIStringBundleService)
                                     .createBundle('chrome://asf/locale/asf.properties');
		var fromfilter = stringbundle.GetStringFromName("save.fromfilter");
		
		var folder = "";
		if (this.firefoxversion == 2) folder = this.loadUnicodeString("browser.download.dir");
		if (this.firefoxversion == 2) // set the show suggested path to "..." because I didn't find how to read the default donloads folder path. (See function Set_savepath(); )
		{
			if (useDownloadDir && folderList == 0)  // desktop
			{
				folder = "...";
			}
			if (useDownloadDir && folderList == 1) // default Downloads folder
			{
				folder = "...";
			}
		}
		if (this.firefoxversion >= 3)
		{
			if (this.inPrivateBrowsing && gDownloadLastDir.file)
			{
				folder = gDownloadLastDir.file.path;
			}
			else
			{
				folder = this.loadUnicodeString("browser.download.lastDir");
			}
			
		}
		
		
		
		// check the lastpath, if different than current folder, then print radio choice to user
		// so he can choose from found filters, or last used path.
		var lastpath = this.loadUnicodeString("extensions.asf.lastpath");
		asf_lastpath.label = lastpath;
		
		if ( (lastpath == folder) || (lastpath == "") || (this.indexInArray(this.matching_folders, lastpath) > -1))  // if same or empty (first time using ASF), or already present from a filter's path, do not show radio for lastpath choice
		{
			asf_lastpath.hidden = true;
		}
		else  // else, if last path is different than folder found in filter, show a choice
		{
			asf_lastpath.hidden = false;
		}
		
		// Firefox 7.0.1+ : Check the current uri lastpath, if not in the available paths then print another radio choice to the user
		asf_currentURI_lastpath.hidden = true;
		if ((this.firefoxversion >= 7.01) && (this.current_uri_lastpath != ""))
		{
			asf_currentURI_lastpath.label = this.current_uri_lastpath;
			if ( (this.indexInArray(this.matching_folders, this.current_uri_lastpath) == -1) && (lastpath != this.current_uri_lastpath) ) // check if it's already listed 
			{
				asf_currentURI_lastpath.hidden = false;
			}
		}
		
		//set the text to be written on the Radio comment
		if (this.matching_folders.length >= 1 && folderList == 2)
		{
			for (var i=asf_savefolder.childNodes.length-1 ; i>=0 ; i--)
			{
				asf_savefolder.removeChild(asf_savefolder.childNodes[i]);
			}
			for (var i = 0; i < this.matching_folders.length; i++)
			{
				var new_radio = document.createElementNS('http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul', 'radio');
				new_radio.setAttribute("id", "asf_savefolder_"+i);
				new_radio.setAttribute("value", i);
				new_radio.setAttribute("width", "280");
				new_radio.setAttribute("crop", "center");
				new_radio.setAttribute("label", this.matching_folders[i]);
				new_radio.setAttribute("class", "small-indent");
				new_radio.setAttribute("tooltiptext", fromfilter);
				new_radio.setAttribute("oncommand", "automatic_save_folder.asf_toggle_savepath(this);");
				asf_savefolder.appendChild(new_radio);
			}
		}
		else
		{
			if (asf_savefolder.childNodes.length == 0)
			{
				var new_radio = document.createElementNS('http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul', 'radio');
				new_radio.setAttribute("id", "asf_savefolder_0");
				new_radio.setAttribute("value", 0);
				new_radio.setAttribute("width", "280");
				new_radio.setAttribute("crop", "center");
				new_radio.setAttribute("label", this.matching_folders[0]);
				new_radio.setAttribute("class", "small-indent");
				new_radio.setAttribute("tooltiptext", fromfilter);
				new_radio.setAttribute("oncommand", "automatic_save_folder.asf_toggle_savepath(this);");
				asf_savefolder.appendChild(new_radio);
			}
			
		}
		
		document.getElementById('asf_savefolder_0').label = folder;
		
		// Force check the first radio choice (needed on linux + ff2.x) (linux has blank radio choices on loading, this is only visual, it doesn't affect anything here, the value are set to the new path by default until the user change the radio choice)
		var asf_radio_savepath = document.getElementById('asf_radio_savepath');
		asf_radio_savepath.value = 0;
		
		
		//now, if the user checked the option to view asf on saving window, set it to visible
		if(asf_viewdloption == true)
		{
			if(asf_viewdloptionType == 0) asf_dloptions.style.visibility = "visible";
			
			if(asf_viewdloptionType == 1)
			{
				asf_dloptions.style.visibility = "visible";
				document.getElementById('asf_dloptions_content').style.visibility = "collapse";
			}
			
			
			
			//If the user checked the option to view the path list on saving window, set it to visible
			if(asf_viewpathselect == true)
			{
				this.read_all_filterpath();
				asf_radiogroup_pathselect.style.visibility = "visible";
			}
			else
			{
				asf_radiogroup_pathselect.style.visibility = "collapse";
			}
			
			// Check if the user use the "useDownloadDir" setting to automatically save to "desktop" or "downloads" and force the suggested path to those folders instead of found filters
			if(folderList != 2) // if set to desktop or Download
			{
				asf_radio_savepath.disabled = true;
				asf_savefolder.disabled = true;
				asf_folder_list.disabled = true;
			}
			else
			{
				asf_radio_savepath.disabled = false;
				asf_savefolder.disabled = false;
				asf_folder_list.disabled = false;
			}
			
			
			// Set the max width to the size of the screen minus 200px. Added for Mac OSX users with long path choice.
			// alert("first screen : " + screen.width + "x" + screen.height);
			asf_dloptions.style.maxWidth = screen.width -200 +"px";
		}
	},
	
	
	toggle_dloptionsContent: function(){
		var asf_dloptions_content = document.getElementById('asf_dloptions_content').style.visibility;
		var asf_viewpathselect = this.prefManager.getBoolPref("extensions.asf.viewpathselect");
		
		document.getElementById('asf_dloptions_content').style.visibility = (asf_dloptions_content == "visible" ? "collapse" : "visible");
		if (asf_viewpathselect) // fix for linux (nested box visibility doesn't work)
		{
			document.getElementById('asf_radiogroup_pathselect').style.visibility = (asf_dloptions_content == "visible" ? "collapse" : "visible");
		}
		window.sizeToContent();
	},
	
	
	check_uCTOption: function (FirstTime) {
		// Check if the user change the unkownContentType option (open with, save as, save with a download manager, etc.)
		var save = document.getElementById("save").selected;
		var asf_radio_savepath = document.getElementById('asf_radio_savepath');
		var asf_savefolder = document.getElementById('asf_savefolder');
		var asf_folder_list = document.getElementById('asf_folder_list');
		var asf_radiogroup_pathselect = document.getElementById('asf_radiogroup_pathselect');
		var asf_viewdloption = this.prefManager.getBoolPref("extensions.asf.viewdloption");
		var asf_viewdloptionType = this.prefManager.getIntPref("extensions.asf.viewdloptionType");
		var asf_viewpathselect = this.prefManager.getBoolPref("extensions.asf.viewpathselect");
		var folderList = this.prefManager.getIntPref("browser.download.folderList");
		var dTa = false;
		if (this.DownThemAll_isEnabled()) // enable ASF box if dTa is selected and sending folder to dTa is enabled.
		{
			dTa = this.prefManager.getBoolPref("extensions.asf.dta_ASFtoDTA_isActive") && (document.getElementById("downthemall").selected || document.getElementById("turbodta").selected);
		}
		
		// Workaround for bug 439323 (if call when not needed, dosen't work anymore)
		// https://bugzilla.mozilla.org/show_bug.cgi?id=439323
		var initialState = document.getElementById('asf_dloptions_content').style.visibility ;
		
		if (asf_viewdloption)
		{
			if(save || dTa) // if set to "save the file"
			{
				if (folderList == 2) asf_radio_savepath.disabled = false;
				if (folderList == 2) asf_savefolder.disabled = false;
				if (folderList == 2) asf_folder_list.disabled = false;
				if ((asf_viewdloptionType == 2) || (asf_viewdloptionType == 3))
				{
					document.getElementById('asf_dloptions').style.visibility = "visible";
					document.getElementById('asf_dloptions_content').style.visibility = "visible";
					if (asf_viewpathselect) // fix for linux (nested box visibility doesn't work)
					{
						document.getElementById('asf_radiogroup_pathselect').style.visibility = "visible";
					}
				}
			}
			else
			{
				asf_radio_savepath.disabled = true;
				asf_savefolder.disabled = true;
				asf_folder_list.disabled = true;
				if (asf_viewdloptionType == 2) // minimize only
				{
					document.getElementById('asf_dloptions').style.visibility = "visible";
					document.getElementById('asf_dloptions_content').style.visibility = "collapse";
					document.getElementById('asf_radiogroup_pathselect').style.visibility = "collapse"; // fix for linux (nested box visibility doesn't work)
				}
				if (asf_viewdloptionType == 3)
				{
					document.getElementById('asf_dloptions').style.visibility = "collapse";
					document.getElementById('asf_dloptions_content').style.visibility = "collapse";
					document.getElementById('asf_radiogroup_pathselect').style.visibility = "collapse"; // fix for linux (nested box visibility doesn't work)
				}
			}
			
			if ( (initialState != document.getElementById('asf_dloptions_content').style.visibility) && (FirstTime != true) ) // FirstTime is also a workaround of sizeToContent bug (which is called onLoad uCT)
			{
				window.sizeToContent();
			}
		}
	},
	
	
	indexInArray: function (arr,val){
		val = val.replace(/\\/g,'\\\\')
				.replace(/\./gi, "\\.")
				.replace(/\*/gi, "\\*")
				.replace(/\$/gi, "\\$")
				.replace(/\^/gi, "\\^")
				.replace(/\+/gi, "\\+")
				.replace(/\?/gi, "\\?")
				.replace(/\|/gi, "\\|")
				.replace(/\[/gi, "\\[")
				.replace(/\]/gi, "\\]")
				.replace(/\(/gi, "\\(")
				.replace(/\)/gi, "\\)")
				.replace(/\//gi, "\\/");
		var test_regexp = new RegExp("^"+val+"$");
		var data = "";
		for(var i=0;i<arr.length;i++)
		{
			if(test_regexp.test(arr[i])) return i;
		}
		return -1;
	} ,
	
	
	read_all_filterpath: function() {
		var variable_mode = this.prefManager.getBoolPref("extensions.asf.variablemode");
		var list = document.getElementById('asf_folder_list');
		var menupopup = document.createElementNS('http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul', 'menupopup');
		
		// Check if there is any filter in list
		var nbrfilters = 	this.prefManager.getIntPref("extensions.asf.filtersNumber");
		var path = "";
		
		// Delete active list before repopulating (if editing filter and coming back to saving window)
		for (var i=list.childNodes.length-1 ; i>=0 ; i--)
		{
			list.removeChild(list.childNodes[i]);
		}
		
		// Write each path to the menupopup
		var pathlist = new Array();
		var pathlist_defaultforceontop = this.prefManager.getBoolPref("extensions.asf.pathlist_defaultforceontop");
		var defaultfolder = this.loadUnicodeString("extensions.asf.defaultfolder");
		var j = 0;
		if (pathlist_defaultforceontop)
		{
			if (variable_mode == true) defaultfolder = this.createfolder(defaultfolder);
			var menuitem = document.createElementNS('http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul', 'menuitem');
			menuitem.setAttribute('label', defaultfolder);
			menuitem.setAttribute('crop', 'center');
			menuitem.setAttribute('value', defaultfolder);
			menupopup.appendChild(menuitem);
		}
		else
		{
			pathlist[0] =  variable_mode == true? this.createfolder(defaultfolder) : defaultfolder;
			j++;
		}
		
		for (var i = 0; i < nbrfilters; i++)
		{
			// read the filter number x
			path = this.loadUnicodeString("extensions.asf.filters"+ i +".folder");
			path = variable_mode == true? this.createfolder(path, i) : path;
			
			if (this.indexInArray(pathlist, path) < 0)
			{ 
				pathlist[j++]= path;
			}
		}
		
		var pathlist_sort_alpha = this.prefManager.getBoolPref("extensions.asf.pathlist_alphasort");
		if (pathlist_sort_alpha) pathlist.sort();
		
		for (var i = 0; i < pathlist.length; i++)
		{
			path = pathlist[i];
			
			var menuitem = document.createElementNS('http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul', 'menuitem');
			menuitem.setAttribute('label', path);
			menuitem.setAttribute('crop', 'center');
			menuitem.setAttribute('value', path);
			menuitem.setAttribute('oncommand', "automatic_save_folder.asf_select_savepath(this)");
			menupopup.appendChild(menuitem);
		}
		
		// Populate the path list into the menu
		list.appendChild(menupopup);
		list.selectedIndex = 0;
	},
	
	
	asf_toggle_savepath: function (elem) {
		
		var asf_pathselect = document.getElementById('asf_pathselect');
		var userchoice = "";
		if(asf_pathselect.selected == true)
		{
			userchoice = document.getElementById('asf_folder_list').value ;
		}
		else
		{
			userchoice = elem.label;
		}
		
		this.set_savepath(userchoice);
		
	},
	
	
	asf_select_savepath: function () {
	
		// check the third radio choice
		var asf_radio_savepath = document.getElementById('asf_radio_savepath');
		var asf_pathselect = document.getElementById('asf_pathselect');
		asf_radio_savepath.value = 99;
		asf_pathselect.checked;
		
		this.asf_toggle_savepath();
	},
	
	
	test_regexp: function (filter_data, downloaded_data, idx, filter_type) {
	/**
	// filter_data (String) : The filter's content
	// downloaded_data (String) : The downloaded filename or domain informations
	// idx (Int) : Current filter number
	// filter_type (String) : Current filter type, can be "domain" of "filename".
	// Return (Array) : return the result as an Array [downloaded_data [, captured group1 [, ... [, captured group9]]]]
	*/
		// Convert normal filter to regular expression filter.
		var isregexp = false;
		if(idx >= 0)
		{
			if (filter_type == "domain") isregexp = this.prefManager.getBoolPref("extensions.asf.filters"+ idx +".domain_regexp");
			if (filter_type == "filename") isregexp = this.prefManager.getBoolPref("extensions.asf.filters"+ idx +".filename_regexp");
		}
		if (isregexp == false) // replace simple wildcard and special characters with corresponding regexp
		{
			filter_data = filter_data.replace(/\./gi, "\\.")
													.replace(/\*/gi, ".*")
													.replace(/\$/gi, "\\$")
													.replace(/\^/gi, "\\^")
													.replace(/\+/gi, "\\+")
													.replace(/\?/gi, ".")
													.replace(/\|/gi, "\\|")
													.replace(/\[/gi, "\\[")
													.replace(/\]/gi, "\\]")
													.replace(/\//gi, "\\/");
			filter_data = ".*"+filter_data+".*";
		}
		
		// initialize the regular expression search
		var param = (this.prefManager.getBoolPref("extensions.asf.regexp_caseinsensitive") == true ? "i" : "");
		try 
		{
			var test = new RegExp(filter_data, param);
		}
		catch(e){
			
			// try to fix parentheses if not used for catching purpose (odd number of parentheses). currently replacing all instances, breaking existing catches.
			filter_data = filter_data.replace(/\(/gi, "\\(")
									 .replace(/\)/gi, "\\)");
			
			try
			{
				test = new RegExp(filter_data, param);
			}
			catch(e){
				alert('\t\tAutomatic Save Folder\n\n-'+e.message+'\nin filter N°'+idx+':\n'+filter_data+'\nregular expression: '+isregexp)
			}
		}
		
		// Thanks to Ted Gifford for the regular expression capture.
		var res = downloaded_data.match(test);
		if (res) return res;
		return false;
	},
	
	
	readHiddenPref: function(pref_place, type, ret) {
		if(this.prefManager.getPrefType(pref_place))
		{
			switch (type)
			{
				case "bool": return this.prefManager.getBoolPref(pref_place);
				case "int" : return this.prefManager.getIntPref(pref_place);
				case "char": return this.prefManager.getCharPref(pref_place);
				case "complex": return this.prefManager.getComplexValue(pref_place, Components.interfaces.nsISupportsString).data;
			}
		}
		else
		{
			return ret; // return default value if pref doesn't exist
		}
	},


	checkFirefoxVersion: function() {

		if (this.versionChecker.compare(this.appInfo.version, "26.0") >= 0)
		{
			this.firefoxversion = 26;
		}
		else if (this.versionChecker.compare(this.appInfo.version, "7.0.1") >= 0)
		{
			this.firefoxversion = 7.01;
		}
		else if (this.versionChecker.compare(this.appInfo.version, "4.0b1") >= 0)
		{
			this.firefoxversion = 4;
		}
		else if(this.versionChecker.compare(this.appInfo.version, "3.0") >= 0) 
		{
			this.firefoxversion = 3;
		}
		else 
		{
			this.firefoxversion = 2;
		}
	},


	// get TabGroup name, from https://hg.mozilla.org/mozilla-central/rev/b284e10652d3
	getActiveGroupName: function () {
		
		var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
						   .getService(Components.interfaces.nsIWindowMediator);
		var mainWindow = wm.getMostRecentWindow("navigator:browser");
		
		// We get the active group this way, instead of querying
		// GroupItems.getActiveGroupItem() because the tabSelect event
		// will not have happened by the time the browser tries to
		// update the title.
		let groupItem = null;
		let activeTab = mainWindow.gBrowser.selectedTab;
		let activeTabItem = activeTab._tabViewTabItem;
		
		if (activeTab.pinned)
		{
			// It's an app tab, so it won't have a .tabItem.
			groupItem = null; // I didn't find how to get the Active Group's Name.
		}
		else if (activeTabItem)
		{
			groupItem = activeTabItem.parent;
		}
		
		// groupItem may still be null, if the active tab is an orphan.
		return groupItem ? groupItem.getTitle() : "";
	},


	DownThemAll_isEnabled: function() {
		// Check for DTA add-on, if enabled return true. 
		
		if (this.firefoxversion >= 4)
		{
			var enabledItems = this.prefManager.getCharPref("extensions.enabledAddons");
		}
		if (this.firefoxversion == 3)
		{
			var enabledItems = this.prefManager.getCharPref("extensions.enabledItems");
		}
		
		var addon_GUUID = "DDC359D1-844A-42a7-9AA1-88A850A938A8";
		var DTA = enabledItems.indexOf(addon_GUUID,0);
		if (DTA >= 0) return true;
		
		//Same but for beta, nighly release of dTa
		var addon_GUUID = "dta@downthemall.net";
		var DTA = enabledItems.indexOf(addon_GUUID,0);
		if (DTA >= 0) return true;
		var addon_GUUID = "dta%40downthemall.net";
		var DTA = enabledItems.indexOf(addon_GUUID,0);
		if (DTA >= 0) return true;
		
		return false;
	},


	DTA_replaceDirectory: function(folder) {
		var dta_pathArray = this.DTA_readDirectory();
		var asf_saveFolder = this.DTA_preparePath(folder); // filtered ASF folder
		var dta_sendMethod = this.prefManager.getCharPref("extensions.asf.dta_sendMethod");
		
		if (dta_sendMethod == "replace")
		{
			dta_pathArray.splice(0, 1, asf_saveFolder );
		}
		if (dta_sendMethod == "add")
		{
			if (dta_pathArray[0] == "")
			{
				dta_pathArray.splice(0, 1, asf_saveFolder);
			}
			else
			{
				dta_pathArray.unshift(asf_saveFolder);
			}
		}
		this.DTA_saveDirectory(dta_pathArray);
	},


	DTA_readDirectory: function() {
		var string = this.loadUnicodeString("extensions.dta.directory");
		// readHiddenPref("extensions.dta.directory", "complex", "[]");
		
		string = string.substring(1, string.length);
		string = string.substring(0, string.length -1);
		var directories = string.split(", ");
		for (var i=0; i < directories.length; i++)
		{
			directories[i] = directories[i].substring(1, directories[i].length);
			directories[i] = directories[i].substring(0, directories[i].length -1);
		}
		return directories;
	},


	DTA_saveDirectory: function(data) {
		var history = this.prefManager.getIntPref("extensions.dta.history");
		var dta_directory = data.slice(0,history)
		
		dta_directory = dta_directory.join("\", \"");
		dta_directory = "[\"" + dta_directory + "\"]";
		
		return this.saveUnicodeString("extensions.dta.directory", dta_directory);
	},


	DTA_setTurboDtaList: function () {
		var dta_pathArray = this.DTA_readDirectory();
		var history = this.prefManager.getIntPref("extensions.dta.history");
		var tdtalist = document.getElementById("tdtalist");
		var dta_sendMethod = this.prefManager.getCharPref("extensions.asf.dta_sendMethod");
		//alert(tdtalist._list.menupopup.children[0].boxObject.element.attributes[0].value);
		
		// rename menuitems labels if there is any
		if (typeof (tdtalist._list.menupopup.children[0]) == "object")
		{
			if (dta_sendMethod == "replace")
			{
				if (this.systemslash == "\\") dta_pathArray[0] = dta_pathArray[0].replace(/\\\\/g, "\\");
				tdtalist._list.menupopup.children[0].boxObject.element.attributes[0].value =  dta_pathArray[0];
			}
			
			if (dta_sendMethod == "add")
			{
			
				// If menulist < history size, add a new menuitem
				if (tdtalist._list.menupopup.children.length < history)
				{ 
					var menuitem = document.createElementNS('http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul', 'menuitem');
					menuitem.setAttribute('label', dta_pathArray[tdtalist._list.menupopup.children.length]);
					menuitem.setAttribute('crop', 'center');
					menuitem.setAttribute('value', dta_pathArray[tdtalist._list.menupopup.children.length]);
					tdtalist._list.menupopup.appendChild(menuitem);
				}
				
				for (var i = 0 ; i < tdtalist._list.menupopup.children.length ; i++)
				{
					if (this.systemslash == "\\") dta_pathArray[i] = dta_pathArray[i].replace(/\\\\/g, "\\");
					tdtalist._list.menupopup.children[i].boxObject.element.attributes[0].value =  dta_pathArray[i];
				}
			}
		}
		else // or create a new menuitem
		{
			var menuitem = document.createElementNS('http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul', 'menuitem');
			menuitem.setAttribute('label', dta_pathArray[0]);
			menuitem.setAttribute('crop', 'center');
			menuitem.setAttribute('value', dta_pathArray[0]);
			tdtalist._list.menupopup.appendChild(menuitem);
			tdtalist._list.selectedIndex = 0;
			document.getElementById("tdta").hidden = false;
			document.getElementById("turbodta").disabled = false;
		}
	},


	DTA_preparePath: function(path) {
		var _profile = Components.classes["@mozilla.org/file/directory_service;1"]
						.getService(Components.interfaces.nsIProperties)
						.get("ProfD", Components.interfaces.nsIFile);
		this.systemslash = (_profile.path.indexOf('/') != -1) ? '/' : '\\';
		
		var formated_path = this.addFinalSlash(path);
		if (this.systemslash == "\\") formated_path = formated_path.replace(/\\/g, "\\\\");
		return formated_path;
	},


	// from dTa 2.x
	DTA_acceptDownload: function(turbo) {
	// New function used by dTa to save files.
	// Accepting the save dialog auomatically doesn't work when dTa is selected.
	// dTa2.x use an eventListener to detect dialogaccept and send data to dTa.
	// this function is a copy from dTa source
	
		let url = dialog.mLauncher.source;
		let referrer;
		try 
		{
			referrer = dialog.mContext.QueryInterface(Components.interfaces.nsIWebNavigation).currentURI.spec;
		}
		catch(ex)
		{
			referrer = url.spec;
		}
		let ml = DTA.getLinkPrintMetalink(url);
		url = new DTA.URL(ml ? ml : url);
	
		DTA.saveSingleLink(window, turbo, url, referrer, "");
	},


	// Inspired from DTA
	addFinalSlash: function(string) {
		if (string.length == 0)
		{
			return this.systemslash;
		}
		
		if (string[string.length - 1] != this.systemslash)
		{
			return string + this.systemslash;
		}
		return string;
	},


	print_r: function (Obj) {
		if(Obj.constructor == Array || Obj.constructor == Object)
		{
			for(var p in Obj)
			{
				if(Obj[p].constructor == Array|| Obj[p].constructor == Object)
				{
					this.result = this.result + "<li>["+p+"] =>"+typeof(Obj)+"</li>";
					this.result = this.result + "<ul>";
					this.print_r(Obj[p]);
					this.result = this.result + "</ul>";
				}
				else 
				{
					this.result = this.result + "<li>["+p+"] =>"+Obj[p]+"</li>";
				}
			}
		}
		return this.result;
	},


	console_print : function (aMessage) {
		var consoleService = Components.classes["@mozilla.org/consoleservice;1"]
                                 .getService(Components.interfaces.nsIConsoleService);
		consoleService.logStringMessage("Automatic Save Folder : \n" + aMessage);
	},
};

	addEventListener( // Autoload
	"load",			// After OnLoad from overlay_unknownContentType.xul file
	function(){ automatic_save_folder.main(); },  // Run main from automatic_save_folder to check the filters
	false
	);