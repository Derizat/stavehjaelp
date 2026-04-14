#!/usr/bin/env python3
"""
Tilføjer nye danske ord til words.json for underrepræsenterede kategorier.
Kør: python3 add-words.py
"""

import json
import sys
from pathlib import Path

WORDS_FILE = Path(__file__).parent / "words.json"

# ============================================================
# NYE ORD — ca. 150 nye ord fordelt på 4 kategorier
# ============================================================

NEW_WORDS = {
    # ── Lydrette ord: +20 (niv2: +8, niv3: +6, niv4: +6) ──
    "Lydrette ord": [
        # niv 2 — mellemlange ord, 4-6 bogstaver, 2 stavelser
        {"word": "panda", "hint": "Sort og hvid bjørn fra Kina", "patternHint": "Alle bogstaver lyder som de skrives", "sentence": "Vi så en panda i zoologisk have.", "level": 2, "category": "Lydrette ord"},
        {"word": "robot", "hint": "Maskine der kan bevæge sig selv", "patternHint": "Alle bogstaver lyder som de skrives", "sentence": "Min robot kan danse og synge.", "level": 2, "category": "Lydrette ord"},
        {"word": "kaktus", "hint": "Plante med torne fra ørkenen", "patternHint": "Alle bogstaver lyder som de skrives", "sentence": "Pas på, en kaktus har skarpe torne.", "level": 2, "category": "Lydrette ord"},
        {"word": "viking", "hint": "Nordisk kriger fra gamle dage", "patternHint": "Alle bogstaver lyder som de skrives", "sentence": "En viking sejlede over havet.", "level": 2, "category": "Lydrette ord"},
        {"word": "motor", "hint": "Det der driver en bil", "patternHint": "Alle bogstaver lyder som de skrives", "sentence": "Bilens motor brummer højt.", "level": 2, "category": "Lydrette ord"},
        {"word": "kamel", "hint": "Dyr med pukkel fra ørkenen", "patternHint": "Alle bogstaver lyder som de skrives", "sentence": "En kamel kan gå længe uden vand.", "level": 2, "category": "Lydrette ord"},
        {"word": "pirat", "hint": "Sørøver med skattekort", "patternHint": "Alle bogstaver lyder som de skrives", "sentence": "En pirat ledte efter en skat.", "level": 2, "category": "Lydrette ord"},
        {"word": "melon", "hint": "Stor rund frugt med meget vand", "patternHint": "Alle bogstaver lyder som de skrives", "sentence": "Vi spiste en stor melon til dessert.", "level": 2, "category": "Lydrette ord"},
        # niv 3 — længere ord, 6-8 bogstaver
        {"word": "krokodil", "hint": "Stort farligt krybdyr med mange tænder", "patternHint": "Alle bogstaver lyder som de skrives", "sentence": "En krokodil lå stille i floden.", "level": 3, "category": "Lydrette ord"},
        {"word": "pelikan", "hint": "Fugl med stor pose under næbbet", "patternHint": "Alle bogstaver lyder som de skrives", "sentence": "En pelikan fangede en fisk i havet.", "level": 3, "category": "Lydrette ord"},
        {"word": "flamingo", "hint": "Lyserød fugl der står på ét ben", "patternHint": "Alle bogstaver lyder som de skrives", "sentence": "En flamingo står elegant på ét ben.", "level": 3, "category": "Lydrette ord"},
        {"word": "skorpion", "hint": "Lille dyr med giftig hale", "patternHint": "Alle bogstaver lyder som de skrives", "sentence": "En skorpion lever i varme lande.", "level": 3, "category": "Lydrette ord"},
        {"word": "mandarin", "hint": "Lille orange citrusfrugt", "patternHint": "Alle bogstaver lyder som de skrives", "sentence": "Jeg pakkede en mandarin i min madpakke.", "level": 3, "category": "Lydrette ord"},
        {"word": "mineral", "hint": "Stof man finder i naturen og sten", "patternHint": "Alle bogstaver lyder som de skrives", "sentence": "Guld er et sjældent mineral.", "level": 3, "category": "Lydrette ord"},
        # niv 4 — lange fonetiske ord
        {"word": "lokomotiv", "hint": "Den forreste del af et tog", "patternHint": "Alle bogstaver lyder som de skrives — langt ord med fire stavelser", "sentence": "Et stort lokomotiv trak de mange vogne.", "level": 4, "category": "Lydrette ord"},
        {"word": "termometer", "hint": "Måler hvor varmt eller koldt det er", "patternHint": "Alle bogstaver lyder som de skrives — fire stavelser", "sentence": "Termometeret viste 30 grader i dag.", "level": 4, "category": "Lydrette ord"},
        {"word": "trampolin", "hint": "Noget man hopper på i haven", "patternHint": "Alle bogstaver lyder som de skrives — tre stavelser", "sentence": "Vi hoppede på trampolinen hele dagen.", "level": 4, "category": "Lydrette ord"},
        {"word": "maraton", "hint": "Et meget langt løb på 42 kilometer", "patternHint": "Alle bogstaver lyder som de skrives — tre stavelser", "sentence": "Min far løb et maraton i København.", "level": 4, "category": "Lydrette ord"},
        {"word": "dinosaur", "hint": "Kæmpe dyr der levede for millioner af år siden", "patternHint": "Alle bogstaver lyder som de skrives — fire stavelser", "sentence": "En dinosaur kunne blive rigtig stor.", "level": 4, "category": "Lydrette ord"},
        {"word": "katedral", "hint": "En meget stor og flot kirke", "patternHint": "Alle bogstaver lyder som de skrives — tre stavelser", "sentence": "Vi besøgte en gammel katedral i byen.", "level": 4, "category": "Lydrette ord"},
    ],

    # ── Nutids-r: +40 (niv1: +10, niv2: +10, niv3: +10, niv4: +10) ──
    "Nutids-r": [
        # niv 1 — enkle verber
        {"word": "løber", "hint": "Bevæger sig hurtigt med benene", "patternHint": "Nutids-r: 'løbe' bliver til 'løber' i nutid", "sentence": "Hun løber meget hurtigt i frikvarteret.", "level": 1, "category": "Nutids-r"},
        {"word": "giver", "hint": "Rækker noget til en anden", "patternHint": "Nutids-r: 'give' bliver til 'giver' i nutid", "sentence": "Han giver sin ven en gave.", "level": 1, "category": "Nutids-r"},
        {"word": "laver", "hint": "Er i gang med at lave noget", "patternHint": "Nutids-r: 'lave' bliver til 'laver' i nutid", "sentence": "Mor laver mad i køkkenet.", "level": 1, "category": "Nutids-r"},
        {"word": "vasker", "hint": "Gør noget rent med vand", "patternHint": "Nutids-r: 'vaske' bliver til 'vasker' i nutid", "sentence": "Far vasker bilen hver lørdag.", "level": 1, "category": "Nutids-r"},
        {"word": "finder", "hint": "Opdager noget man ledte efter", "patternHint": "Nutids-r: 'finde' bliver til 'finder' i nutid", "sentence": "Hun finder altid de bedste sten på stranden.", "level": 1, "category": "Nutids-r"},
        {"word": "bager", "hint": "Tilbereder brød eller kage i ovnen", "patternHint": "Nutids-r: 'bage' bliver til 'bager' i nutid", "sentence": "Bedstemor bager en lækker kage.", "level": 1, "category": "Nutids-r"},
        {"word": "køber", "hint": "Betaler penge for en vare", "patternHint": "Nutids-r: 'købe' bliver til 'køber' i nutid", "sentence": "Vi køber mælk i supermarkedet.", "level": 1, "category": "Nutids-r"},
        {"word": "siger", "hint": "Bruger ord til at fortælle noget", "patternHint": "Nutids-r: 'sige' bliver til 'siger' i nutid", "sentence": "Læreren siger at vi skal være stille.", "level": 1, "category": "Nutids-r"},
        {"word": "henter", "hint": "Går hen og tager noget med tilbage", "patternHint": "Nutids-r: 'hente' bliver til 'henter' i nutid", "sentence": "Far henter os fra skole.", "level": 1, "category": "Nutids-r"},
        {"word": "passer", "hint": "Sørger for at noget er i orden", "patternHint": "Nutids-r: 'passe' bliver til 'passer' i nutid", "sentence": "Hun passer godt på sin lillebror.", "level": 1, "category": "Nutids-r"},
        # niv 2 — almindelige verber
        {"word": "spiller", "hint": "Deltager i et spil eller en sport", "patternHint": "Nutids-r: 'spille' bliver til 'spiller' i nutid", "sentence": "Vi spiller fodbold efter skole.", "level": 2, "category": "Nutids-r"},
        {"word": "venter", "hint": "Bliver på stedet til noget sker", "patternHint": "Nutids-r: 'vente' bliver til 'venter' i nutid", "sentence": "Vi venter på bussen ved stoppestedet.", "level": 2, "category": "Nutids-r"},
        {"word": "bygger", "hint": "Sætter ting sammen til noget nyt", "patternHint": "Nutids-r: 'bygge' bliver til 'bygger' i nutid", "sentence": "Drengene bygger et stort sandslot.", "level": 2, "category": "Nutids-r"},
        {"word": "sender", "hint": "Får noget bragt til en anden", "patternHint": "Nutids-r: 'sende' bliver til 'sender' i nutid", "sentence": "Jeg sender et brev til min mormor.", "level": 2, "category": "Nutids-r"},
        {"word": "samler", "hint": "Bringer flere ting sammen", "patternHint": "Nutids-r: 'samle' bliver til 'samler' i nutid", "sentence": "Klassen samler affald i skolegården.", "level": 2, "category": "Nutids-r"},
        {"word": "planter", "hint": "Sætter frø eller planter i jorden", "patternHint": "Nutids-r: 'plante' bliver til 'planter' i nutid", "sentence": "Vi planter blomster i haven.", "level": 2, "category": "Nutids-r"},
        {"word": "klapper", "hint": "Slår hænderne sammen", "patternHint": "Nutids-r: 'klappe' bliver til 'klapper' i nutid", "sentence": "Publikum klapper efter forestillingen.", "level": 2, "category": "Nutids-r"},
        {"word": "ønsker", "hint": "Vil gerne have noget", "patternHint": "Nutids-r: 'ønske' bliver til 'ønsker' i nutid", "sentence": "Jeg ønsker mig en ny cykel til jul.", "level": 2, "category": "Nutids-r"},
        {"word": "regner", "hint": "Vand der falder ned fra skyerne", "patternHint": "Nutids-r: 'regne' bliver til 'regner' i nutid", "sentence": "Det regner meget i dag.", "level": 2, "category": "Nutids-r"},
        {"word": "stopper", "hint": "Holder op med at bevæge sig", "patternHint": "Nutids-r: 'stoppe' bliver til 'stopper' i nutid", "sentence": "Bussen stopper ved næste stoppested.", "level": 2, "category": "Nutids-r"},
        # niv 3 — sværere verber
        {"word": "forklarer", "hint": "Gør noget tydeligt for andre", "patternHint": "Nutids-r: 'forklare' bliver til 'forklarer' i nutid", "sentence": "Læreren forklarer den svære opgave.", "level": 3, "category": "Nutids-r"},
        {"word": "opdager", "hint": "Finder noget nyt og uventet", "patternHint": "Nutids-r: 'opdage' bliver til 'opdager' i nutid", "sentence": "Forskeren opdager en ny dyreart.", "level": 3, "category": "Nutids-r"},
        {"word": "beskriver", "hint": "Fortæller med ord hvordan noget ser ud", "patternHint": "Nutids-r: 'beskrive' bliver til 'beskriver' i nutid", "sentence": "Hun beskriver sit yndlingsdyr i stilen.", "level": 3, "category": "Nutids-r"},
        {"word": "forbinder", "hint": "Sætter to ting sammen", "patternHint": "Nutids-r: 'forbinde' bliver til 'forbinder' i nutid", "sentence": "Broen forbinder de to øer.", "level": 3, "category": "Nutids-r"},
        {"word": "anvender", "hint": "Bruger noget til et bestemt formål", "patternHint": "Nutids-r: 'anvende' bliver til 'anvender' i nutid", "sentence": "Eleven anvender sin nye viden i opgaven.", "level": 3, "category": "Nutids-r"},
        {"word": "behandler", "hint": "Tager sig af noget eller nogen", "patternHint": "Nutids-r: 'behandle' bliver til 'behandler' i nutid", "sentence": "Lægen behandler patienten forsigtigt.", "level": 3, "category": "Nutids-r"},
        {"word": "betragter", "hint": "Ser grundigt på noget", "patternHint": "Nutids-r: 'betragte' bliver til 'betragter' i nutid", "sentence": "Pigen betragter sommerfuglen i haven.", "level": 3, "category": "Nutids-r"},
        {"word": "udfordrer", "hint": "Giver nogen en svær opgave", "patternHint": "Nutids-r: 'udfordre' bliver til 'udfordrer' i nutid", "sentence": "Spillet udfordrer os med nye baner.", "level": 3, "category": "Nutids-r"},
        {"word": "overrasker", "hint": "Gør noget uventet for nogen", "patternHint": "Nutids-r: 'overraske' bliver til 'overrasker' i nutid", "sentence": "Vi overrasker mor med morgenmad på sengen.", "level": 3, "category": "Nutids-r"},
        {"word": "fantaserer", "hint": "Forestiller sig ting i tankerne", "patternHint": "Nutids-r: 'fantasere' bliver til 'fantaserer' i nutid", "sentence": "Han fantaserer om at rejse til rummet.", "level": 3, "category": "Nutids-r"},
        # niv 4 — komplekse verber
        {"word": "identificerer", "hint": "Finder ud af hvad noget er", "patternHint": "Nutids-r: 'identificere' bliver til 'identificerer' i nutid", "sentence": "Politiet identificerer fingeraftrykkene.", "level": 4, "category": "Nutids-r"},
        {"word": "eksperimenterer", "hint": "Prøver nye ting for at lære", "patternHint": "Nutids-r: 'eksperimentere' bliver til 'eksperimenterer' i nutid", "sentence": "Klassen eksperimenterer med kemiske stoffer.", "level": 4, "category": "Nutids-r"},
        {"word": "karakteriserer", "hint": "Beskriver de vigtigste træk ved noget", "patternHint": "Nutids-r: 'karakterisere' bliver til 'karakteriserer' i nutid", "sentence": "Læreren karakteriserer hovedpersonen i bogen.", "level": 4, "category": "Nutids-r"},
        {"word": "kategoriserer", "hint": "Sorterer i grupper efter type", "patternHint": "Nutids-r: 'kategorisere' bliver til 'kategoriserer' i nutid", "sentence": "Eleven kategoriserer dyrene efter størrelse.", "level": 4, "category": "Nutids-r"},
        {"word": "konkurrerer", "hint": "Kæmper mod andre om at vinde", "patternHint": "Nutids-r: 'konkurrere' bliver til 'konkurrerer' i nutid", "sentence": "Holdene konkurrerer om førstepladsen.", "level": 4, "category": "Nutids-r"},
        {"word": "demonstrerer", "hint": "Viser hvordan noget virker", "patternHint": "Nutids-r: 'demonstrere' bliver til 'demonstrerer' i nutid", "sentence": "Læreren demonstrerer forsøget for klassen.", "level": 4, "category": "Nutids-r"},
        {"word": "kvalificerer", "hint": "Opnår ret til at deltage i noget", "patternHint": "Nutids-r: 'kvalificere' bliver til 'kvalificerer' i nutid", "sentence": "Holdet kvalificerer sig til finalen.", "level": 4, "category": "Nutids-r"},
        {"word": "symboliserer", "hint": "Er et tegn eller billede på noget", "patternHint": "Nutids-r: 'symbolisere' bliver til 'symboliserer' i nutid", "sentence": "Den hvide due symboliserer fred.", "level": 4, "category": "Nutids-r"},
        {"word": "revolutionerer", "hint": "Ændrer noget fuldstændigt", "patternHint": "Nutids-r: 'revolutionere' bliver til 'revolutionerer' i nutid", "sentence": "Den nye opfindelse revolutionerer hverdagen.", "level": 4, "category": "Nutids-r"},
        {"word": "kommunikerer", "hint": "Taler sammen og deler tanker", "patternHint": "Nutids-r: 'kommunikere' bliver til 'kommunikerer' i nutid", "sentence": "Eleverne kommunikerer godt i gruppearbejdet.", "level": 4, "category": "Nutids-r"},
        # Ekstra ord til at kompensere for dubletter
        {"word": "kører", "hint": "Styrer en bil eller cykel fremad", "patternHint": "Nutids-r: 'køre' bliver til 'kører' i nutid", "sentence": "Far kører os til skole hver morgen.", "level": 1, "category": "Nutids-r"},
        {"word": "drikker", "hint": "Får væske ned i maven", "patternHint": "Nutids-r: 'drikke' bliver til 'drikker' i nutid", "sentence": "Jeg drikker et glas mælk.", "level": 1, "category": "Nutids-r"},
        {"word": "holder", "hint": "Har fat i noget med hænderne", "patternHint": "Nutids-r: 'holde' bliver til 'holder' i nutid", "sentence": "Hun holder sin bamse tæt.", "level": 1, "category": "Nutids-r"},
        {"word": "skriver", "hint": "Sætter ord ned på papir", "patternHint": "Nutids-r: 'skrive' bliver til 'skriver' i nutid", "sentence": "Eleven skriver en stil i dansk.", "level": 1, "category": "Nutids-r"},
        {"word": "rydder", "hint": "Gør et sted rent og pænt", "patternHint": "Nutids-r: 'rydde' bliver til 'rydder' i nutid", "sentence": "Vi rydder op på værelset.", "level": 2, "category": "Nutids-r"},
        {"word": "handler", "hint": "Køber varer i en butik", "patternHint": "Nutids-r: 'handle' bliver til 'handler' i nutid", "sentence": "Mor handler ind i supermarkedet.", "level": 2, "category": "Nutids-r"},
        {"word": "husker", "hint": "Kan komme i tanke om noget", "patternHint": "Nutids-r: 'huske' bliver til 'husker' i nutid", "sentence": "Jeg husker altid at pakke min madpakke.", "level": 2, "category": "Nutids-r"},
        {"word": "bestemmer", "hint": "Tager en beslutning om noget", "patternHint": "Nutids-r: 'bestemme' bliver til 'bestemmer' i nutid", "sentence": "Læreren bestemmer hvornår vi holder pause.", "level": 3, "category": "Nutids-r"},
        {"word": "udvikler", "hint": "Får noget til at vokse og blive bedre", "patternHint": "Nutids-r: 'udvikle' bliver til 'udvikler' i nutid", "sentence": "Firmaet udvikler nye spil til børn.", "level": 3, "category": "Nutids-r"},
        {"word": "formulerer", "hint": "Sætter tanker sammen til ord", "patternHint": "Nutids-r: 'formulere' bliver til 'formulerer' i nutid", "sentence": "Hun formulerer altid sine svar tydeligt.", "level": 4, "category": "Nutids-r"},
        {"word": "administrerer", "hint": "Styrer og organiserer noget stort", "patternHint": "Nutids-r: 'administrere' bliver til 'administrerer' i nutid", "sentence": "Rektor administrerer hele skolen.", "level": 4, "category": "Nutids-r"},
        {"word": "programmerer", "hint": "Skriver kode til computere", "patternHint": "Nutids-r: 'programmere' bliver til 'programmerer' i nutid", "sentence": "Min storebror programmerer sit eget spil.", "level": 4, "category": "Nutids-r"},
    ],

    # ── Fremmedord: +40 (niv2: +10, niv3: +15, niv4: +15) ──
    "Fremmedord": [
        # niv 2 — mellemsvære fremmedord
        {"word": "banana", "hint": "Gul kroget frugt", "patternHint": "Fremmedord fra spansk/portugisisk — staves med 'a' ligesom på originalsproget", "sentence": "Jeg spiste en banana til frokost.", "level": 2, "category": "Fremmedord"},
        {"word": "sofa", "hint": "Blød møbel man sidder i", "patternHint": "Fremmedord fra arabisk — staves med 'f' ikke 'ph'", "sentence": "Vi sad i sofaen og så film.", "level": 2, "category": "Fremmedord"},
        {"word": "salat", "hint": "Grøn ret med grøntsager", "patternHint": "Fremmedord fra italiensk — staves med enkelt 'l'", "sentence": "Vi fik salat som tilbehør til maden.", "level": 2, "category": "Fremmedord"},
        {"word": "musik", "hint": "Lyde der er sat sammen til melodier", "patternHint": "Fremmedord fra græsk/latin — staves med 'k' til sidst", "sentence": "Jeg elsker at lytte til musik.", "level": 2, "category": "Fremmedord"},
        {"word": "karate", "hint": "Japansk kampsport med spark og slag", "patternHint": "Fremmedord fra japansk — staves med 'k' og ender på 'e'", "sentence": "Min bror træner karate to gange om ugen.", "level": 2, "category": "Fremmedord"},
        {"word": "safari", "hint": "Tur i naturen for at se vilde dyr", "patternHint": "Fremmedord fra swahili — staves med 'f' og ender på 'i'", "sentence": "Vi var på safari og så løver.", "level": 2, "category": "Fremmedord"},
        {"word": "sushi", "hint": "Japansk mad med ris og fisk", "patternHint": "Fremmedord fra japansk — 'sh' udtales som 'sj'", "sentence": "Vi spiste sushi i en japansk restaurant.", "level": 2, "category": "Fremmedord"},
        {"word": "giraff", "hint": "Meget højt dyr med lang hals", "patternHint": "Fremmedord fra arabisk — staves med 'ff' til sidst og 'g' udtales som 'sj'", "sentence": "En giraff kan blive over 5 meter høj.", "level": 2, "category": "Fremmedord"},
        {"word": "yoghurt", "hint": "Syrlig mælkeprodukt", "patternHint": "Fremmedord fra tyrkisk — staves med 'gh' som er stumt", "sentence": "Jeg spiser yoghurt med müsli til morgenmad.", "level": 2, "category": "Fremmedord"},
        {"word": "jungle", "hint": "Tæt tropisk skov", "patternHint": "Fremmedord fra hindi/engelsk — 'j' udtales som 'dj'", "sentence": "Der bor mange dyr i junglen.", "level": 2, "category": "Fremmedord"},
        # niv 3 — sværere fremmedord
        {"word": "bibliotek", "hint": "Sted hvor man låner bøger", "patternHint": "Fremmedord fra græsk — 'th' udtales som 't', og 'ek' til sidst", "sentence": "Vi låner bøger på biblioteket hver uge.", "level": 3, "category": "Fremmedord"},
        {"word": "gymnasium", "hint": "Skole man går på efter folkeskolen", "patternHint": "Fremmedord fra græsk/latin — staves med 'y' og 'ium' til sidst", "sentence": "Min storesøster går på gymnasium.", "level": 3, "category": "Fremmedord"},
        {"word": "astronaut", "hint": "Person der rejser ud i rummet", "patternHint": "Fremmedord fra græsk — 'au' staves som det lyder", "sentence": "En astronaut svæver rundt i rumstationen.", "level": 3, "category": "Fremmedord"},
        {"word": "journalist", "hint": "Person der skriver nyheder", "patternHint": "Fremmedord fra fransk — 'j' udtales som 'sj' og 'ou' staves usædvanligt", "sentence": "Journalisten interviewede borgmesteren.", "level": 3, "category": "Fremmedord"},
        {"word": "champion", "hint": "Den der vinder mesterskabet", "patternHint": "Fremmedord fra fransk/engelsk — 'ch' udtales som 'tj'", "sentence": "Holdet blev champion i turneringen.", "level": 3, "category": "Fremmedord"},
        {"word": "kalkulator", "hint": "Maskine der regner for dig", "patternHint": "Fremmedord fra latin — staves med 'k' to gange, ikke 'c'", "sentence": "Brug en kalkulator til den svære opgave.", "level": 3, "category": "Fremmedord"},
        {"word": "terapeut", "hint": "Person der hjælper folk med problemer", "patternHint": "Fremmedord fra græsk — staves med 'th' der udtales som 't'", "sentence": "Terapeuten hjalp drengen med at tale om sine følelser.", "level": 3, "category": "Fremmedord"},
        {"word": "katastrofe", "hint": "Meget stor og alvorlig ulykke", "patternHint": "Fremmedord fra græsk — staves med 'ph' der er blevet til 'f'", "sentence": "Oversvømmelsen var en stor katastrofe.", "level": 3, "category": "Fremmedord"},
        {"word": "akrobat", "hint": "Person der laver kunster med kroppen", "patternHint": "Fremmedord fra græsk — staves med 'k' og 'b'", "sentence": "Akrobaten lavede saltoer i cirkus.", "level": 3, "category": "Fremmedord"},
        {"word": "elefant", "hint": "Kæmpestort gråt dyr med snabel", "patternHint": "Fremmedord fra latin/græsk — staves med 'f' ikke 'ph'", "sentence": "Elefanten sprøjtede vand med sin snabel.", "level": 3, "category": "Fremmedord"},
        {"word": "telefon", "hint": "Apparat man ringer med", "patternHint": "Fremmedord fra græsk — 'tele' betyder fjern, 'fon' betyder lyd", "sentence": "Min telefon ringede midt i timen.", "level": 3, "category": "Fremmedord"},
        {"word": "fotografi", "hint": "Billede taget med et kamera", "patternHint": "Fremmedord fra græsk — 'foto' betyder lys, 'grafi' betyder at skrive", "sentence": "Jeg tog et flot fotografi af solnedgangen.", "level": 3, "category": "Fremmedord"},
        {"word": "strategi", "hint": "En klog plan for at nå et mål", "patternHint": "Fremmedord fra græsk — staves med 'str' i starten og 'gi' til sidst", "sentence": "Vi lagde en god strategi for fodboldkampen.", "level": 3, "category": "Fremmedord"},
        {"word": "garanti", "hint": "Løfte om at noget virker som det skal", "patternHint": "Fremmedord fra fransk — staves med 'g' og ender på 'i'", "sentence": "Computeren har to års garanti.", "level": 3, "category": "Fremmedord"},
        {"word": "diamant", "hint": "Meget dyrt og hårdt krystal", "patternHint": "Fremmedord fra græsk — staves med 'di' og 'a' i midten", "sentence": "En diamant er den hårdeste sten i verden.", "level": 3, "category": "Fremmedord"},
        # niv 4 — komplekse fremmedord
        {"word": "arkitektur", "hint": "Kunsten at tegne og bygge huse", "patternHint": "Fremmedord fra græsk/latin — staves med 'k' og 'tur' til sidst", "sentence": "Byen er kendt for sin smukke arkitektur.", "level": 4, "category": "Fremmedord"},
        {"word": "filosofi", "hint": "At tænke dybe tanker om livet", "patternHint": "Fremmedord fra græsk — 'f' bruges i stedet for 'ph', ender på 'i'", "sentence": "Vi lærte om filosofi i skolen.", "level": 4, "category": "Fremmedord"},
        {"word": "revolution", "hint": "Stor forandring af et helt samfund", "patternHint": "Fremmedord fra latin/fransk — staves med 'tion' der udtales 'sjon'", "sentence": "Den franske revolution ændrede verden.", "level": 4, "category": "Fremmedord"},
        {"word": "teknologi", "hint": "Viden om maskiner og computere", "patternHint": "Fremmedord fra græsk — 'tekno' betyder kunst/færdighed, ender på 'gi'", "sentence": "Ny teknologi gør hverdagen lettere.", "level": 4, "category": "Fremmedord"},
        {"word": "meditation", "hint": "At sidde stille og finde ro i sindet", "patternHint": "Fremmedord fra latin — staves med 'tion' der udtales 'sjon'", "sentence": "Klassen prøvede meditation for at slappe af.", "level": 4, "category": "Fremmedord"},
        {"word": "meteorologi", "hint": "Videnskaben om vejret", "patternHint": "Fremmedord fra græsk — 'meteor' plus 'logi' (lære), staves med 'eo'", "sentence": "Meteorologi handler om at forudsige vejret.", "level": 4, "category": "Fremmedord"},
        {"word": "kommunikation", "hint": "At tale og forstå hinanden", "patternHint": "Fremmedord fra latin — dobbelt 'm' og 'tion' til sidst", "sentence": "God kommunikation er vigtigt i en gruppe.", "level": 4, "category": "Fremmedord"},
        {"word": "vaccination", "hint": "Sprøjte der beskytter mod sygdom", "patternHint": "Fremmedord fra latin — dobbelt 'c' og 'tion' der udtales 'sjon'", "sentence": "Børnene fik en vaccination hos lægen.", "level": 4, "category": "Fremmedord"},
        {"word": "præsentation", "hint": "At vise noget frem for andre", "patternHint": "Fremmedord fra latin — 'præ' i starten og 'tion' til sidst", "sentence": "Eleven holdt en flot præsentation for klassen.", "level": 4, "category": "Fremmedord"},
        {"word": "koreografi", "hint": "Planlagte dansetrin til musik", "patternHint": "Fremmedord fra græsk — 'koreo' plus 'grafi', staves med 'e' og 'o'", "sentence": "Danserne øvede koreografien til showet.", "level": 4, "category": "Fremmedord"},
        {"word": "civilisation", "hint": "Et samfund med kultur og regler", "patternHint": "Fremmedord fra latin — staves med 'c' der udtales 's' og 'tion'", "sentence": "De gamle romere havde en stor civilisation.", "level": 4, "category": "Fremmedord"},
        {"word": "xylofon", "hint": "Instrument med træstave man slår på", "patternHint": "Fremmedord fra græsk — staves med 'x' og 'y', 'fon' betyder lyd", "sentence": "Barnet spillede på sin farverige xylofon.", "level": 4, "category": "Fremmedord"},
        {"word": "encyclopædi", "hint": "Stort opslagsværk med viden om alt muligt", "patternHint": "Fremmedord fra græsk — staves med 'enc', 'y' og 'æ'", "sentence": "Vi slog svaret op i en encyclopædi.", "level": 4, "category": "Fremmedord"},
        {"word": "psykologi", "hint": "Videnskaben om tanker og følelser", "patternHint": "Fremmedord fra græsk — stumt 'p' i starten, staves med 'y' og 'gi'", "sentence": "Psykologi handler om hvordan mennesker tænker.", "level": 4, "category": "Fremmedord"},
        {"word": "renaissance", "hint": "Tidsperiode med kunst og genopdagelse", "patternHint": "Fremmedord fra fransk — 're' plus 'naissance', 'ai' og stumt 'e'", "sentence": "Mange berømte malerier stammer fra renæssancen.", "level": 4, "category": "Fremmedord"},
        # Ekstra ord til at kompensere for dubletter
        {"word": "balkon", "hint": "Lille udendørs platform på en bygning", "patternHint": "Fremmedord fra italiensk — staves med 'k' ikke 'c'", "sentence": "Vi sad på balkonen og nød solen.", "level": 2, "category": "Fremmedord"},
        {"word": "garage", "hint": "Rum hvor man parkerer bilen", "patternHint": "Fremmedord fra fransk — 'g' udtales blødt som 'sj' til sidst", "sentence": "Bilen stod parkeret i garagen.", "level": 2, "category": "Fremmedord"},
        {"word": "parfume", "hint": "Duftende væske man sprøjter på sig", "patternHint": "Fremmedord fra fransk — staves med 'par' og stumt 'e'", "sentence": "Mor fik en ny parfume i gave.", "level": 3, "category": "Fremmedord"},
        {"word": "akvarium", "hint": "Glasbeholder med fisk og vand", "patternHint": "Fremmedord fra latin — 'kv' bruges i stedet for 'qu'", "sentence": "Vi har et stort akvarium med tropiske fisk.", "level": 3, "category": "Fremmedord"},
        {"word": "synonym", "hint": "Ord der betyder det samme som et andet", "patternHint": "Fremmedord fra græsk — staves med 'y' to gange", "sentence": "Glad og lykkelig er et synonym.", "level": 4, "category": "Fremmedord"},
        {"word": "hieroglyf", "hint": "Gammelt egyptisk billedtegn", "patternHint": "Fremmedord fra græsk — staves med 'ie', 'gl' og 'y'", "sentence": "Egypterne skrev med hieroglyffer på væggene.", "level": 4, "category": "Fremmedord"},
        {"word": "monolog", "hint": "Når én person taler alene", "patternHint": "Fremmedord fra græsk — 'mono' betyder én, 'log' betyder tale", "sentence": "Skuespilleren holdt en lang monolog på scenen.", "level": 3, "category": "Fremmedord"},
        {"word": "labyrint", "hint": "Forvirrende system af gange", "patternHint": "Fremmedord fra græsk — staves med 'y' i midten", "sentence": "Vi gik vild i den store labyrint.", "level": 3, "category": "Fremmedord"},
        {"word": "termin", "hint": "Bestemt tidspunkt eller deadline", "patternHint": "Fremmedord fra latin — staves med 'ter' og 'in'", "sentence": "Vi har termin for opgaven på fredag.", "level": 2, "category": "Fremmedord"},
        {"word": "kreativ", "hint": "Opfindsom og fuld af idéer", "patternHint": "Fremmedord fra latin — staves med 'kr' og 'iv' til sidst", "sentence": "Hun er meget kreativ når hun tegner.", "level": 3, "category": "Fremmedord"},
    ],

    # ── Blødt d: +50 (niv0: +5, niv1: +10, niv2: +10, niv3: +15, niv4: +10) ──
    "Blødt d": [
        # niv 0 — korte ord med blødt d
        {"word": "mad", "hint": "Noget man spiser for at blive mæt", "patternHint": "Blødt 'd' til sidst — udtales næsten som 'mað'", "sentence": "Vi fik lækker mad til aftensmad.", "level": 0, "category": "Blødt d"},
        {"word": "god", "hint": "Positiv — det modsatte af dårlig", "patternHint": "Blødt 'd' til sidst — udtales næsten som 'goð'", "sentence": "Det var en rigtig god dag.", "level": 0, "category": "Blødt d"},
        {"word": "bod", "hint": "Lille hus eller stand på et marked", "patternHint": "Blødt 'd' til sidst — udtales næsten som 'boð'", "sentence": "Vi købte slik fra en bod på markedet.", "level": 0, "category": "Blødt d"},
        {"word": "rad", "hint": "En lang række af ting", "patternHint": "Blødt 'd' til sidst — udtales næsten som 'rað'", "sentence": "Bilerne stod på rad og række.", "level": 0, "category": "Blødt d"},
        {"word": "sod", "hint": "Sort støv fra en skorsten", "patternHint": "Blødt 'd' til sidst — udtales næsten som 'soð'", "sentence": "Skorstenen var fuld af sod.", "level": 0, "category": "Blødt d"},
        # niv 1 — korte ord med tydeligt blødt d
        {"word": "sted", "hint": "Et bestemt punkt eller lokation", "patternHint": "Blødt 'd' til sidst — udtales næsten som 'steð'", "sentence": "Vi fandt et dejligt sted at holde picnic.", "level": 1, "category": "Blødt d"},
        {"word": "glad", "hint": "En følelse når man er lykkelig", "patternHint": "Blødt 'd' til sidst — udtales næsten som 'glað'", "sentence": "Jeg er meget glad for min gave.", "level": 1, "category": "Blødt d"},
        {"word": "sød", "hint": "Smagsoplevelse som sukker giver", "patternHint": "Blødt 'd' til sidst — udtales næsten som 'søð'", "sentence": "Kagen var meget sød og lækker.", "level": 1, "category": "Blødt d"},
        {"word": "vred", "hint": "En følelse når man er sur og ophidset", "patternHint": "Blødt 'd' til sidst — udtales næsten som 'vreð'", "sentence": "Far blev vred da vasen gik i stykker.", "level": 1, "category": "Blødt d"},
        {"word": "tråd", "hint": "Tynd snor man syr med", "patternHint": "Blødt 'd' til sidst — udtales næsten som 'tråð'", "sentence": "Mor syede med en rød tråd.", "level": 1, "category": "Blødt d"},
        {"word": "fred", "hint": "Ro og harmoni — det modsatte af krig", "patternHint": "Blødt 'd' til sidst — udtales næsten som 'freð'", "sentence": "Der var fred og ro i huset.", "level": 1, "category": "Blødt d"},
        {"word": "hud", "hint": "Det der dækker hele kroppen", "patternHint": "Blødt 'd' til sidst — udtales næsten som 'huð'", "sentence": "Solen kan brænde din hud.", "level": 1, "category": "Blødt d"},
        {"word": "bud", "hint": "En person der bringer pakker", "patternHint": "Blødt 'd' til sidst — udtales næsten som 'buð'", "sentence": "Et bud kom med en pakke til os.", "level": 1, "category": "Blødt d"},
        {"word": "skud", "hint": "Lyden fra noget der affyres", "patternHint": "Blødt 'd' til sidst — udtales næsten som 'skuð'", "sentence": "Startskuddet lød og løberne satte af sted.", "level": 1, "category": "Blødt d"},
        {"word": "stod", "hint": "Var oppe på benene — datid af stå", "patternHint": "Blødt 'd' til sidst — udtales næsten som 'stoð'", "sentence": "Katten stod på bordet.", "level": 1, "category": "Blødt d"},
        # niv 2 — ord med blødt d i midten eller bøjningsform
        {"word": "flade", "hint": "Noget der er jævnt og lige", "patternHint": "Blødt 'd' i midten — 'd' mellem vokaler udtales blødt", "sentence": "Danmark er et meget fladt og flade land.", "level": 2, "category": "Blødt d"},
        {"word": "glade", "hint": "Flere personer der er lykkelige", "patternHint": "Blødt 'd' i midten — flertal af 'glad', 'd' udtales blødt", "sentence": "Børnene var glade for gaven.", "level": 2, "category": "Blødt d"},
        {"word": "bade", "hint": "At vaske sig i vand", "patternHint": "Blødt 'd' i midten — 'd' mellem vokaler udtales blødt", "sentence": "Vi skal bade i søen i dag.", "level": 2, "category": "Blødt d"},
        {"word": "fade", "hint": "Store flade tallerkner til mad", "patternHint": "Blødt 'd' i midten — 'd' mellem vokaler udtales blødt", "sentence": "Mor satte to store fade på bordet.", "level": 2, "category": "Blødt d"},
        {"word": "steder", "hint": "Flere forskellige lokationer", "patternHint": "Blødt 'd' i midten — 'd' bevares i bøjningen", "sentence": "Vi besøgte mange spændende steder.", "level": 2, "category": "Blødt d"},
        {"word": "vide", "hint": "At kende til noget — have information", "patternHint": "Blødt 'd' i midten — 'd' mellem vokaler udtales blødt", "sentence": "Jeg vil gerne vide mere om dinosaurer.", "level": 2, "category": "Blødt d"},
        {"word": "fader", "hint": "Et andet ord for far", "patternHint": "Blødt 'd' i midten — 'd' mellem vokaler udtales blødt", "sentence": "Min fader arbejder på et kontor.", "level": 2, "category": "Blødt d"},
        {"word": "moder", "hint": "Et gammelt ord for mor", "patternHint": "Blødt 'd' i midten — 'd' mellem vokaler udtales blødt", "sentence": "Moderen tog sig kærligt af sine børn.", "level": 2, "category": "Blødt d"},
        {"word": "broder", "hint": "Et gammelt ord for bror", "patternHint": "Blødt 'd' i midten — 'd' mellem vokaler udtales blødt", "sentence": "Min broder og jeg leger sammen hver dag.", "level": 2, "category": "Blødt d"},
        {"word": "kode", "hint": "Hemmelige tegn eller programmeringssprog", "patternHint": "Blødt 'd' i midten — 'd' mellem vokaler udtales blødt", "sentence": "Vi lærte at skrive en kode på computeren.", "level": 2, "category": "Blødt d"},
        # niv 3 — ord med dd eller komplekst blødt d
        {"word": "gadder", "hint": "Tynde grene brugt til hegn", "patternHint": "Dobbelt 'd' — 'dd' bruges til at markere kort vokal før blødt d", "sentence": "Hegnet var lavet af gadder.", "level": 3, "category": "Blødt d"},
        {"word": "madder", "hint": "Flere stykker smørrebrød", "patternHint": "Dobbelt 'd' — 'dd' markerer kort 'a' før blødt d", "sentence": "Mor smurte madder til madpakken.", "level": 3, "category": "Blødt d"},
        {"word": "buddet", "hint": "Det tilbud der blev givet", "patternHint": "Dobbelt 'd' — 'dd' i bøjningsformen af 'bud'", "sentence": "Buddet på huset var meget højt.", "level": 3, "category": "Blødt d"},
        {"word": "sidder", "hint": "Er placeret på en stol eller bænk", "patternHint": "Dobbelt 'd' — 'dd' markerer kort vokal, blødt d-lyd", "sentence": "Katten sidder i vinduet og kigger ud.", "level": 3, "category": "Blødt d"},
        {"word": "fodrer", "hint": "Giver mad til dyr", "patternHint": "Blødt 'd' i midten — 'd' i 'foder' bevares i bøjningen", "sentence": "Pigen fodrer ænderne i parken.", "level": 3, "category": "Blødt d"},
        {"word": "videre", "hint": "At fortsætte fremad", "patternHint": "Blødt 'd' i midten — 'd' mellem vokaler udtales blødt", "sentence": "Vi skal videre til næste opgave.", "level": 3, "category": "Blødt d"},
        {"word": "bredere", "hint": "Mere bred — komparativ form", "patternHint": "Blødt 'd' i midten — 'd' bevares i gradbøjningen", "sentence": "Vejen blev bredere efter svinget.", "level": 3, "category": "Blødt d"},
        {"word": "ledder", "hint": "Led og bevæger kroppen", "patternHint": "Dobbelt 'd' — 'dd' markerer kort vokal før blødt d", "sentence": "Hun ledder efter sin tabte nøgle.", "level": 3, "category": "Blødt d"},
        {"word": "fodtøj", "hint": "Sko, støvler og sandaler", "patternHint": "Blødt 'd' i 'fod' — udtales blødt selv i sammensat ord", "sentence": "Husk at tage varmt fodtøj på om vinteren.", "level": 3, "category": "Blødt d"},
        {"word": "stedvis", "hint": "Nogle steder men ikke alle", "patternHint": "Blødt 'd' i 'sted' — bevares i det sammensatte ord", "sentence": "Det regnede stedvis i løbet af dagen.", "level": 3, "category": "Blødt d"},
        {"word": "rødlig", "hint": "Lidt rød i farven", "patternHint": "Blødt 'd' i 'rød' — bevares når '-lig' tilføjes", "sentence": "Himlen var rødlig ved solnedgang.", "level": 3, "category": "Blødt d"},
        {"word": "fredelig", "hint": "Rolig og uden problemer", "patternHint": "Blødt 'd' i 'fred' — bevares i afledningen", "sentence": "Det var en fredelig aften ved søen.", "level": 3, "category": "Blødt d"},
        {"word": "bladene", "hint": "Flere af de flade grønne ting på træer", "patternHint": "Blødt 'd' i midten — 'd' i 'blad' udtales blødt i bøjningen", "sentence": "Bladene faldt ned fra træerne om efteråret.", "level": 3, "category": "Blødt d"},
        {"word": "eddike", "hint": "Sur væske man bruger i madlavning", "patternHint": "Dobbelt 'd' — 'dd' markerer kort vokal, blødt d-lyd", "sentence": "Mor brugte eddike i salatdressingen.", "level": 3, "category": "Blødt d"},
        {"word": "rødder", "hint": "Den del af planten der er under jorden", "patternHint": "Dobbelt 'd' — 'dd' markerer kort 'ø' før blødt d", "sentence": "Træets rødder gik dybt ned i jorden.", "level": 3, "category": "Blødt d"},
        # niv 4 — lange ord med blødt d-mønstre
        {"word": "vedligeholdelse", "hint": "At passe på og reparere ting", "patternHint": "Blødt 'd' i 'ved' og i 'holde' — to bløde d-lyde i ét ord", "sentence": "Huset trænger til vedligeholdelse.", "level": 4, "category": "Blødt d"},
        {"word": "broderskab", "hint": "Et stærkt fællesskab mellem brødre eller venner", "patternHint": "Blødt 'd' i 'broder' — bevares i det lange ord", "sentence": "De havde et stærkt broderskab.", "level": 4, "category": "Blødt d"},
        {"word": "moderskab", "hint": "Det at være mor til et barn", "patternHint": "Blødt 'd' i 'moder' — bevares i afledningen", "sentence": "Moderskab er en stor opgave.", "level": 4, "category": "Blødt d"},
        {"word": "faderskab", "hint": "Det at være far til et barn", "patternHint": "Blødt 'd' i 'fader' — bevares i afledningen", "sentence": "Han tog sit faderskab meget seriøst.", "level": 4, "category": "Blødt d"},
        {"word": "kodesprog", "hint": "Hemmeligt sprog kun få forstår", "patternHint": "Blødt 'd' i 'kode' — bevares i det sammensatte ord", "sentence": "Børnene opfandt deres eget kodesprog.", "level": 4, "category": "Blødt d"},
        {"word": "middelhavs", "hint": "Relateret til det store hav mellem Europa og Afrika", "patternHint": "Dobbelt 'd' i 'middel' — 'dd' markerer kort vokal", "sentence": "Vi sejlede rundt i Middelhavet.", "level": 4, "category": "Blødt d"},
        {"word": "fredstid", "hint": "En periode uden krig", "patternHint": "Blødt 'd' i både 'fred' og 'tid' — to bløde d-lyde", "sentence": "I fredstid kan folk leve trygt.", "level": 4, "category": "Blødt d"},
        {"word": "rødgrød", "hint": "Dansk dessert lavet af bær", "patternHint": "Blødt 'd' i både 'rød' og 'grød' — dobbelt blødt d", "sentence": "Vi fik rødgrød med fløde til dessert.", "level": 4, "category": "Blødt d"},
        {"word": "stedfortræder", "hint": "En person der tager en andens plads", "patternHint": "Blødt 'd' i 'sted' — bevares i det sammensatte ord", "sentence": "Læreren havde en stedfortræder i dag.", "level": 4, "category": "Blødt d"},
        {"word": "fodaftryk", "hint": "Mærke i sandet fra en fod", "patternHint": "Blødt 'd' i 'fod' — bevares i det sammensatte ord", "sentence": "Vi så fodaftryk i sneen fra et stort dyr.", "level": 4, "category": "Blødt d"},
        # Ekstra ord til at kompensere for dubletter
        {"word": "bid", "hint": "Et stykke man tager med tænderne", "patternHint": "Blødt 'd' til sidst — udtales næsten som 'bið'", "sentence": "Kan jeg få en bid af dit æble?", "level": 0, "category": "Blødt d"},
        {"word": "ned", "hint": "Retning mod jorden — det modsatte af op", "patternHint": "Blødt 'd' til sidst — udtales næsten som 'neð'", "sentence": "Bolden rullede ned ad bakken.", "level": 0, "category": "Blødt d"},
        {"word": "rod", "hint": "Den del af planten under jorden", "patternHint": "Blødt 'd' til sidst — udtales næsten som 'roð'", "sentence": "Træet har en stor rod.", "level": 0, "category": "Blødt d"},
        {"word": "nød", "hint": "Hård frugt fra et træ med skal", "patternHint": "Blødt 'd' til sidst — udtales næsten som 'nøð'", "sentence": "Egernet gemte en nød i træet.", "level": 1, "category": "Blødt d"},
        {"word": "brod", "hint": "Spids ting som en bi stikker med", "patternHint": "Blødt 'd' til sidst — udtales næsten som 'broð'", "sentence": "Bien stak med sin brod.", "level": 1, "category": "Blødt d"},
        {"word": "rode", "hint": "At blande rundt og lave uorden", "patternHint": "Blødt 'd' i midten — 'd' mellem vokaler udtales blødt", "sentence": "Du må ikke rode med dine ting.", "level": 2, "category": "Blødt d"},
        {"word": "glæde", "hint": "En følelse af lykke og tilfredshed", "patternHint": "Blødt 'd' i midten — 'd' mellem vokaler udtales blødt", "sentence": "Det var en stor glæde at se dig.", "level": 2, "category": "Blødt d"},
        {"word": "fodbolden", "hint": "Den bestemte bold man sparker til", "patternHint": "Blødt 'd' i 'fod' — bevares i det sammensatte ord", "sentence": "Fodbolden fløj over målet.", "level": 3, "category": "Blødt d"},
        {"word": "gladere", "hint": "Mere lykkelig end før", "patternHint": "Blødt 'd' i midten — 'd' fra 'glad' bevares i gradbøjningen", "sentence": "Han blev gladere da solen kom frem.", "level": 3, "category": "Blødt d"},
        {"word": "hædersmand", "hint": "En ærlig og respekteret person", "patternHint": "Blødt 'd' i 'hæder' — bevares i sammensat ord", "sentence": "Bedstefar var en rigtig hædersmand.", "level": 4, "category": "Blødt d"},
        {"word": "madpakke", "hint": "Pose med frokost man tager med", "patternHint": "Blødt 'd' i 'mad' — bevares i det sammensatte ord", "sentence": "Jeg glemte min madpakke derhjemme.", "level": 3, "category": "Blødt d"},
        {"word": "hudpleje", "hint": "At passe godt på huden med creme", "patternHint": "Blødt 'd' i 'hud' — bevares i det sammensatte ord", "sentence": "Mor bruger hudpleje hver aften.", "level": 4, "category": "Blødt d"},
    ],
}


def main():
    # 1. Læs eksisterende words.json
    with open(WORDS_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)

    # 2. Saml alle eksisterende ord (lowercase) til dublet-check
    existing_words = set()
    for cat, words in data.items():
        for w in words:
            existing_words.add(w["word"].lower())

    print(f"Eksisterende ord i words.json: {len(existing_words)}")
    print()

    # 3. Tilføj nye ord pr. kategori
    total_added = 0
    total_skipped = 0
    summary = {}

    for category, new_words in NEW_WORDS.items():
        added = 0
        skipped = 0
        skipped_words = []

        if category not in data:
            data[category] = []

        for word_entry in new_words:
            w = word_entry["word"].lower()

            # Dublet-check
            if w in existing_words:
                skipped += 1
                skipped_words.append(word_entry["word"])
                continue

            # Valider at hint IKKE indeholder ordet selv
            hint_lower = word_entry["hint"].lower()
            word_lower = word_entry["word"].lower()
            if word_lower in hint_lower:
                print(f"  ADVARSEL: Hint for '{word_entry['word']}' indeholder selve ordet — springer over!")
                skipped += 1
                skipped_words.append(word_entry["word"])
                continue

            # Valider at alle felter er til stede
            required = {"word", "hint", "patternHint", "sentence", "level", "category"}
            if not required.issubset(word_entry.keys()):
                missing = required - word_entry.keys()
                print(f"  ADVARSEL: '{word_entry.get('word', '???')}' mangler felter: {missing} — springer over!")
                skipped += 1
                continue

            data[category].append(word_entry)
            existing_words.add(w)
            added += 1

        total_added += added
        total_skipped += skipped

        # Tæl niveaufordeling
        level_counts = {}
        for w in data[category]:
            lv = w["level"]
            level_counts[lv] = level_counts.get(lv, 0) + 1

        summary[category] = {
            "added": added,
            "skipped": skipped,
            "skipped_words": skipped_words,
            "total": len(data[category]),
            "levels": level_counts,
        }

    # 4. Skriv opdateret fil
    with open(WORDS_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    # 5. Print opsummering
    print("=" * 60)
    print(f"OPSUMMERING — {total_added} ord tilføjet, {total_skipped} sprunget over")
    print("=" * 60)

    for cat, info in summary.items():
        print(f"\n{cat}:")
        print(f"  Tilføjet: {info['added']}, Sprunget over: {info['skipped']}")
        if info["skipped_words"]:
            print(f"  Dubletter/problemer: {', '.join(info['skipped_words'])}")
        print(f"  Nyt total: {info['total']} ord")
        levels_str = ", ".join(f"niv{lv}: {cnt}" for lv, cnt in sorted(info["levels"].items()))
        print(f"  Niveauer: {levels_str}")

    # Grand total
    grand_total = sum(len(words) for words in data.values())
    print(f"\nSamlet antal ord i words.json: {grand_total}")


if __name__ == "__main__":
    main()
