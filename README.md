# dezoomify-extension

![Tests](https://github.com/lovasoa/dezoomify-extension/workflows/Tests/badge.svg)

## What does it do ?
This project is a browser extension for detecting zoomable images in web pages and downloading them with [dezoomify](https://github.com/lovasoa/dezoomify). It works with many different websites from museums, art galleries, libraries, and many other sources. 

## How to use
1. Install the extension,
1. open a zoomable image in your browser,
1. click the grey magnifying glass icon in the address bar (<img src="./icons/grey/icon-24.png" width=16 height=16/>),
1. the icon should become blue (<img src="./icons/color/icon-24.png" width=16 height=16/>), denoting that the extension is now actively listening for zoomable image requests,
1. zoom into the image or reload the page
1. if the extension detected zoomable images, you should see a small badge appear over the icon with the number of images found written in it
1. click the icon to open the image in the dezoomify website
1. click "dezoomify", and wait for the image to download

![Short animated tutorial](https://user-images.githubusercontent.com/552629/76173337-e7ce3780-619e-11ea-9171-ed47a74cafbe.gif)

## How to install
You can install this extension from your browser's official plugin market :
 - for Firefox, see [dezoomify on **Mozilla Addons**](https://addons.mozilla.org/en-US/firefox/addon/dezoomify/)
 - for Chrome, see [dezoomify on the **Chrome Web Store**](https://chrome.google.com/webstore/detail/dezoomify/iapjjopjejpelnfdonefbffahmcndfbm) ( *Unfortunately, google takes several weeks to review every extension update, so this version is usually less up-to-date and has more bugs than the firefox one* )

You can also [download the extension](https://github.com/lovasoa/dezoomify-extension/releases) and install it manually in developer mode.

## How does it work ?

When you click on the addon's icon (the magnifying glass), it starts intercepting
all network requests coming from the site you are currently on.

When a request to what looks like a zoomable image (based on a set of URL patterns) is found,
it shows a little badge in your address bar, which you can click 
to download the image with dezoomify.

For more information about dezoomify, see the [dezoomify readme](https://github.com/lovasoa/dezoomify#dezoomify).

## Permissions

This browser addon requires the following permissions:

 - *Access your data for all websites* :
    needed to intercept the requests that pages make, in order to look for zoomable images inside them.

## Free Software
This addon is a free software (see [LICENSE](./LICENSE)).
You can see its source code at: https://github.com/lovasoa/dezoomify-extension/
