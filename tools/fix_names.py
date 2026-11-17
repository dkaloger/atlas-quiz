"""Tidy figure names in data/ after a new export: add missing accents, capitalise, sort atlases.

Run from the site folder:  python3 tools/fix_names.py
Words not in ACCENTS are left as they are, and the script prints any name that still has none.
"""
import glob
import json
import re

ACCENTS = {
    # bones and joints
    'ανωνυμο': 'ανώνυμο', 'οστο': 'οστό', 'συνδεσμοι': 'σύνδεσμοι', 'πυελου': 'πυέλου',
    'μηριαιο': 'μηριαίο', 'επιγονατιδα': 'επιγονατίδα', 'σκελετος': 'σκελετός',
    'διαρθρωση': 'διάρθρωση', 'διαρθρωσης': 'διάρθρωσης', 'διαρθρωσεις': 'διαρθρώσεις',
    'κινησεις': 'κινήσεις', 'γονατος': 'γόνατος', 'ισχιου': 'ισχίου', 'ισχυου': 'ισχίου',
    'οσφυικοι': 'οσφυικοί', 'σπονδυλοι': 'σπόνδυλοι', 'ιερο': 'ιερό', 'κοκκυγας': 'κόκκυγας',
    # muscles and regions
    'επιπολης': 'επιπολής', 'κοιλιακοι': 'κοιλιακοί', 'μυες': 'μύες', 'πλαγια': 'πλάγια',
    'ομαδα': 'ομάδα', 'προσθια': 'πρόσθια', 'οπισθια': 'οπίσθια', 'ραχιαιοι': 'ραχιαίοι',
    'προσαγωγοι': 'προσαγωγοί', 'μηρου': 'μηρού', 'προσθιοι': 'πρόσθιοι', 'οπισθιοι': 'οπίσθιοι',
    'οπισθιες': 'οπίσθιοι', 'γλουτιαια': 'γλουτιαία', 'μηριαια': 'μηριαία', 'χωρα': 'χώρα',
    'συνεχεια': 'συνέχεια',
    # vessels
    'εσω': 'έσω', 'εξω': 'έξω', 'λαγονια': 'λαγόνια', 'λαγονιες': 'λαγόνιες',
    'αρτηρια': 'αρτηρία', 'αρτηριες': 'αρτηρίες', 'ιγνυακη': 'ιγνυακή', 'φλεβες': 'φλέβες',
    'κνημης': 'κνήμης', 'ακρου': 'άκρου', 'ακρων': 'άκρων', 'ποδος': 'ποδός', 'κατω': 'κάτω',
}
ACCENTED = re.compile('[άέήίόύώΐΰΆΈΉΊΌΎΏ]')


def fix(name):
    def word(m):
        w = m.group(0)
        new = ACCENTS.get(w.lower())
        if not new:
            return w
        return new[0].upper() + new[1:] if w[0].isupper() else new
    name = re.sub(r'[Α-Ωα-ωά-ώΆ-Ώ]+', word, name)
    name = re.sub(r',(?=\S)', ', ', name).strip()
    return name[:1].upper() + name[1:]


def natural(title):
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r'(\d+)', title)]


for path in glob.glob('data/atlases/*/atlas.json'):
    atlas = json.load(open(path))
    changed = False
    for plate in atlas['plates']:
        old = plate.get('name')
        if not old:
            continue
        new = fix(old)
        if new != old:
            plate['name'], changed = new, True
            print(f'{old}  →  {new}')
        if not ACCENTED.search(new) and re.search('[α-ω]', new):
            print(f'  NO ACCENTS, add to ACCENTS: {new}')
    if changed:
        json.dump(atlas, open(path, 'w'), ensure_ascii=False, indent=2)

manifest = json.load(open('data/manifest.json'))
manifest['atlases'].sort(key=lambda a: natural(a['title']))
for subject in manifest['subjects']:
    for lecture in subject['lectures']:
        titles = {a['id']: a['title'] for a in manifest['atlases']}
        lecture['atlases'].sort(key=lambda a: natural(titles.get(a['atlasID'], '')))
json.dump(manifest, open('data/manifest.json', 'w'), ensure_ascii=False, indent=2)
