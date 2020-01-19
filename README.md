# dezoomify-extension

## What does it do ?
This project is a browser extension for detecting zoomable images in web pages and downloading them with [dezoomify](https://github.com/lovasoa/dezoomify).

Just install the extension, open a zoomable image in your browser,
click the magnifying glass icon in the address bar,
and you'll be able to download the image.

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

## Free Software
This addon is a free software (see [LICENSE](./LICENSE)).
You can see its source code at: https://github.com/lovasoa/dezoomify-extension/