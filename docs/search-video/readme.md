## Quickstart

### Installing the library


```javascript


/**
 * Given a search query, searching on youtube
 * @param {string} search value (string or videoId).
 * @param {duration} search value (string).
 under: < 4 minutes
 between: 4–20 minutes
 over: > 20 minutes
 */
const videos = await yt.search('Hallo Welt');
const videos = await yt.search('Hallo Welt', {duration: 'under'});
const videos = await yt.search('y5kIrbG2gRc');
console.log('Videos:');
console.log(videos);

[
    {
        "id":
        {
            "videoId": "y5kIrbG2gRc"
        },
        "url": "https://www.youtube.com/watch?v=y5kIrbG2gRc",
        "title": "How to Download Free Music On Your iPhone (OFFLINE) 2020",
        "description": "",
        "duration_raw": "2:01",
        "snippet":
        {
            "url": "https://www.youtube.com/watch?v=y5kIrbG2gRc",
            "duration": "2:01",
            "publishedAt": "3 years ago",
            "thumbnails":
            {
                "id": "y5kIrbG2gRc",
                "url": "https://i.ytimg.com/vi/y5kIrbG2gRc/hq720.jpg?sqp=-oaymwEXCNAFEJQDSFryq4qpAwkIARUAAIhCGAE=&rs=AOn4CLDuzgRSHVaWMTmiU4TAzv0Opz2CmQ",
                "default":
                {
                    "url": "https://i.ytimg.com/vi/y5kIrbG2gRc/hq720.jpg?sqp=-oaymwEXCNAFEJQDSFryq4qpAwkIARUAAIhCGAE=&rs=AOn4CLDuzgRSHVaWMTmiU4TAzv0Opz2CmQ",
                    "width": 720,
                    "height": 404
                },
                "high":
                {
                    "url": "https://i.ytimg.com/vi/y5kIrbG2gRc/hq720.jpg?sqp=-oaymwEXCNAFEJQDSFryq4qpAwkIARUAAIhCGAE=&rs=AOn4CLDuzgRSHVaWMTmiU4TAzv0Opz2CmQ",
                    "width": 720,
                    "height": 404
                },
                "height": 404,
                "width": 720
            },
            "title": "How to Download Free Music On Your iPhone (OFFLINE) 2020"
        },
        "views": "199"
    },
    ...
]
```

