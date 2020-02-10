# dezoomify-extension

## What does it do ?
This project is a browser extension for detecting zoomable images in web pages and downloading them with [dezoomify](https://github.com/lovasoa/dezoomify).

Just install the extension, open a zoomable image in your browser,
click the magnifying glass icon in the address bar (<img src="./icons/icon.svg" width=20 height=20/>),
and you'll be able to download the image.

<img src="https://addons.cdn.mozilla.net/user-media/previews/full/230/230329.png?modified=1578086032" height=300 /> <img src="https://user-images.githubusercontent.com/552629/72672454-9afd9880-3a5a-11ea-958e-b262a615fa31.png" height=300 />

## How does it work ?

This browser add-on intercepts requests made by websites and searches zoomable images in them.
When a zoomable image is found, it adds a small button in your address bar that allows you to download the image with dezoomify.

For more information about dezoomify, see: https://github.com/lovasoa/dezoomify

## Permissions

This browser addon requires the following permissions:

 - *Access your data for all websites* :
    needed to intercept web requests made by websites in order to search for zoomable image metadata.
 - *Access browser activity during navigation* :
    needed to detect when you leave a webpage, so that the icon can be hidden and the older zoomable image information forgotten.

## How to install
You can install this extension from your browser's official plugin market :
 - for Firefox, see [dezoomify on **Mozilla Addons**](https://addons.mozilla.org/en-US/firefox/addon/dezoomify/)
 - for Chrome, see [dezoomify on the **Chrome Web Store**](https://chrome.google.com/webstore/detail/dezoomify/iapjjopjejpelnfdonefbffahmcndfbm)

## Free Software
This addon is a free software (see [LICENSE](./LICENSE)).
You can see its source code at: https://github.com/lovasoa/dezoomify-extension/
