import urllib.request, json
urls = [
    'https://api.sleeper.app/v1/players/nfl',
    'https://fantasyfootballcalculator.com/api/v1/adp?format=json',
    'https://fantasyfootballcalculator.com/api/v1/adp',
    'https://api.fantasypros.com/v2/consensus/rankings?position=RB&year=2024'
]
for url in urls:
    try:
        req = urllib.request.Request(url, headers={'User-Agent':'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=30) as r:
            body = r.read(4000).decode('utf-8', 'ignore')
            print(url)
            print('status', r.status)
            print(body[:1000])
            print('---')
    except Exception as e:
        print(url)
        print('ERR', repr(e))
        print('---')
