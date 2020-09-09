version=$(jq '.version' < package.json)

# Firefox extension
jq '.version |= '"$version"' | 
    .permissions |= ["<all_urls>"] + .
' < manifest-template.json > manifest.json

rm dezoomify-firefox.zip
zip -r dezoomify-firefox.zip icons/ background.js manifest.json

# Chrome extension
jq '.version |= '"$version" < manifest-template.json > manifest.json

rm dezoomify-chrome.zip
zip -r dezoomify-chrome.zip icons/ background.js manifest.json

rm manifest.json