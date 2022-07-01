MeshCommander Command Line Switches
===================================

To make Mesh Commander run as a stand-alone tool, you will need NW.js (http://nwjs.io/). It's basically a browser frame that allows web
applications to run natively. Once you get NW.js installed, open "commander.htm". MeshCommander will accept the following command line
arguments. Note that these command line switches are only intended to work with MeshCommander running within NW.js, and are not
applicable to other editions of MeshCommander.

	-kvmviewonly		Remote desktop will not allow mouse & keyboard input.
	-host:[hostname]	Directly connect to a target host. If user/pass arguments are not provided, Kerberos will be used.
				The following arguments are only valid if -host is specified

		-user:[username]	Username to use to connect to Intel AMT is digest mode.
		-pass:[password]	Password to use to connect to Intel AMT in digest mode.
		-tls			Connect with TLS security enabled (Currently, Intel AMT certificate is ignored)
		-kvm			Go directly into remote desktop mode and connect to hardware KVM.
		-kvmfull		Go directly into full screen remote desktop and connect to hardware KVM.
		-kvmonly		Go directly into full screen remote desktop, don't do any extra WSMAN calls.
                -kvmenc:n               KVM encoder flags, the sum of the numbers below:
                                            1 = Run Length Encoding (RLE). If not set, RAW mode is used. RLE always recommanded.
                                            2 = 16 bits per pixel. If not set, 8 bits per pixel is used.
                                            4 = Gray scale mode. If not set, color mode is used. Gray scale is only supported on some platforms.
                                            8 = Enable ZLIB compression. If not set ZLIB is not used. Control over ZLIB is only supported on some platforms.
                                           16 = Gray scale half-mode, 4 bits per pixel (16 grays). Ignored unless doing KVM in gray scale mode.
                -kvmdec:n               KVM downscaling (decimation) modes. One of the numbers below. This is only supported on some platforms.
                                            0 = Not set
                                            1 = Disabled
                                            2 = Automatic
                                            3 = Enabled
		-sol			Go directly into terminal and connect to Serial-over-LAN. 
		-script:[file]		Run a script targeting [hostname].
		-autoexit		Run a script and exit when done.
		-ignoretls		Causes TLS certificate check to be skipped.

	-list:[listfile]	Loads a list of computers into Mesh Commander. The format of the file is JSON like this.
				For Kerberos, set the user to "*" and password to empty. "name" is optional.

		{
		  "computers": [
		    { "name": "FriendlyName", "host": "hostname", "user": "admin", "pass": "password1", "tls": 0 },
		    { "host": "hostname1", "user": "admin", "pass": "password2", "tls": 1 },
		    { "host": "hostname1", "user": "*", "pass": "", "tls": 1 }
		  ]
		}

		Along with -list:[listfile], you can also use:

		-script:[file]		Run a script targeting all of the computers in [listfile].
		-autoexit		Run a script and exit when done.
		-ignoretls		Causes TLS certificate check to be skipped.

	-debug			Starts MeshCommander with the debug console window visible.
	-wsmantrace		Display all WSMAN traffic in the debug console.
	-norefresh		MeshCommander will not periodically poll for updates.
	-redirtrace		Display all redirection data channel data to the debug console window.
	-kvmdatatrace		Display KVM data channel data in the debug console window.
	-kvmonly		MeshCommander will only get minimal data from Intel AMT in order to only support KVM.
	-logfile:log.txt	Log everything from the debug console windows into a text file.
	-noredirdisconnect	Don't auto-disconnect redirection session with performing certain power commands.
