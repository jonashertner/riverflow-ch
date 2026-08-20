/* The words that arrive with the data.
 *
 * Everything a page writes at runtime lives in i18n.js and i18n-map.js, keyed by
 * a short name. This file is the third case: strings the build wrote into the
 * data files, keyed by the string itself. They are of two kinds and both are here
 * for the same reason.
 *
 * The first kind is this site's own description of a source: what it is, how
 * often it moves, what class of claim it can support, and the note that says what
 * it does not contain. Those sentences are written in the build script, in
 * English, because that is where the source list is maintained.
 *
 * The second kind is a value quoted from a federal register, which arrives in
 * German because the register that published it is German: Bogenmauer,
 * Laufkraftwerk, Hochmoorumfeld. The Confederation publishes those same registers
 * in French and Italian, and the term used here is the one that register itself
 * uses, so that a reader who goes to the register finds the word they were shown.
 * Where a register has no Romansh edition the German term is kept and named as
 * German, because inventing a term for a legal category would be worse than
 * quoting one.
 *
 * A string with no row here is shown as it stands. Nothing disappears for want of
 * a translation.
 */
Object.assign(DSTR, {

  // ---- what each source is ------------------------------------------------
  'Basis for determining Q347': {
    de: 'Grundlagen zur Bestimmung von Q347',
    fr: 'Bases pour la détermination du Q347',
    it: 'Basi per la determinazione del Q347',
    rm: 'Basas per determinar il Q347',
  },
  'Residual-flow map: the cantonal inventory of existing abstractions': {
    de: 'Restwasserkarte: das kantonale Inventar der bestehenden Wasserentnahmen',
    fr: 'Carte des débits résiduels : l’inventaire cantonal des prélèvements existants',
    it: 'Carta dei deflussi residuali: l’inventario cantonale dei prelievi esistenti',
    rm: 'Charta da l’aua restanta: l’inventari chantunal da las prelevaziuns existentas',
  },
  'Treatment plants and their share of the receiving water at Q347': {
    de: 'Abwasserreinigungsanlagen und ihr Anteil am Vorfluter bei Q347',
    fr: 'Stations d’épuration et leur part du milieu récepteur au Q347',
    it: 'Impianti di depurazione e la loro quota del corpo ricettore al Q347',
    rm: 'Implants da nettegiada da las auas e lur part da las auas recepientas tar Q347',
  },
  'Groundwater bodies': {
    de: 'Grundwasserkörper',
    fr: 'Corps d’eaux souterraines',
    it: 'Corpi d’acqua sotterranea',
    rm: 'Corps d’aua sutterrana',
  },
  'Federal inventory of alluvial zones of national importance': {
    de: 'Bundesinventar der Auengebiete von nationaler Bedeutung',
    fr: 'Inventaire fédéral des zones alluviales d’importance nationale',
    it: 'Inventario federale delle zone golenali d’importanza nazionale',
    rm: 'Inventari federal da las zonas alluvialas d’impurtanza naziunala',
  },
  'Federal inventory of mire landscapes of particular beauty and national importance': {
    de: 'Bundesinventar der Moorlandschaften von besonderer Schönheit und von nationaler Bedeutung',
    fr: 'Inventaire fédéral des sites marécageux d’une beauté particulière et d’importance nationale',
    it: 'Inventario federale dei paesaggi palustri di particolare bellezza e d’importanza nazionale',
    rm: 'Inventari federal da las cuntradas palustras d’ina bellezza particulara e d’impurtanza naziunala',
  },
  'River network, catchment area and long-term mean discharge': {
    de: 'Gewässernetz, Einzugsgebiet und langjähriger mittlerer Abfluss',
    fr: 'Réseau hydrographique, bassin versant et débit moyen à long terme',
    it: 'Rete idrografica, bacino imbrifero e portata media a lungo termine',
    rm: 'Rait da las auas, bogn da rimnada e quantitad d’aua media da blers onns',
  },
  'Nuclear power stations': {
    de: 'Kernkraftwerke', fr: 'Centrales nucléaires', it: 'Centrali nucleari', rm: 'Ovras nuclearas',
  },
  'Lakes and the national border': {
    de: 'Seen und die Landesgrenze',
    fr: 'Lacs et frontière nationale',
    it: 'Laghi e confine nazionale',
    rm: 'Lais ed il cunfin naziunal',
  },
  'Drinking-water protection zones S1 to S3, in force (oldest delivery: NE)': {
    de: 'Grundwasserschutzzonen S1 bis S3, rechtskräftig (älteste Lieferung: NE)',
    fr: 'Zones de protection des eaux souterraines S1 à S3, en force (livraison la plus ancienne : NE)',
    it: 'Zone di protezione delle acque sotterranee S1–S3, in vigore (consegna più vecchia: NE)',
    rm: 'Zonas da protecziun da l’aua sutterrana S1 fin S3, en vigur (furniziun la pli veglia: NE)',
  },
  'Swiss Glacier Inventory 1850 and 2023, and glacier length change': {
    de: 'Schweizerisches Gletscherinventar 1850 und 2023 sowie Gletscherlängenänderung',
    fr: 'Inventaire des glaciers suisses 1850 et 2023, et variations de longueur',
    it: 'Inventario dei ghiacciai svizzeri 1850 e 2023 e variazioni di lunghezza',
    rm: 'Inventari dals glatschers svizzers 1850 e 2023 e midadas da lunghezza',
  },
  'Dams under federal supervision': {
    de: 'Stauanlagen unter Bundesaufsicht',
    fr: 'Barrages sous surveillance fédérale',
    it: 'Sbarramenti sotto vigilanza federale',
    rm: 'Stanziadas sut surveglianza federala',
  },
  'Sub-catchments of Switzerland, 2 km2': {
    de: 'Teileinzugsgebiete der Schweiz, 2 km²',
    fr: 'Sous-bassins versants de la Suisse, 2 km²',
    it: 'Sottobacini della Svizzera, 2 km²',
    rm: 'Sutbogns da rimnada da la Svizra, 2 km²',
  },
  'Federal inventory of raised and transitional bogs of national importance': {
    de: 'Bundesinventar der Hoch- und Übergangsmoore von nationaler Bedeutung',
    fr: 'Inventaire fédéral des hauts-marais et des marais de transition d’importance nationale',
    it: 'Inventario federale delle torbiere alte e di transizione d’importanza nazionale',
    rm: 'Inventari federal dals palis auts e da transiziun d’impurtanza naziunala',
  },
  'Federal inventory of fens of national importance': {
    de: 'Bundesinventar der Flachmoore von nationaler Bedeutung',
    fr: 'Inventaire fédéral des bas-marais d’importance nationale',
    it: 'Inventario federale delle torbiere basse d’importanza nazionale',
    rm: 'Inventari federal dals palis bass d’impurtanza naziunala',
  },
  'Statistics of hydropower plants from 300 kW up (WASTA)': {
    de: 'Statistik der Wasserkraftanlagen ab 300 kW (WASTA)',
    fr: 'Statistique des aménagements hydroélectriques dès 300 kW (WASTA)',
    it: 'Statistica degli impianti idroelettrici da 300 kW (WASTA)',
    rm: 'Statistica da las ovras idraulicas a partir da 300 kW (WASTA)',
  },
  'Names of the watercourses, lakes, glaciers and springs': {
    de: 'Namen der Gewässer, Seen, Gletscher und Quellen',
    fr: 'Noms des cours d’eau, des lacs, des glaciers et des sources',
    it: 'Nomi dei corsi d’acqua, dei laghi, dei ghiacciai e delle sorgenti',
    rm: 'Noms da las auas, dals lais, dals glatschers e da las funtaunas',
  },
  'Federal inventory of amphibian spawning sites of national importance': {
    de: 'Bundesinventar der Amphibienlaichgebiete von nationaler Bedeutung',
    fr: 'Inventaire fédéral des sites de reproduction de batraciens d’importance nationale',
    it: 'Inventario federale dei siti di riproduzione degli anfibi d’importanza nazionale',
    rm: 'Inventari federal dals lieus da reproducziun d’amfibis d’impurtanza naziunala',
  },
  'Filling level of the storage reservoirs, weekly, in GWh': {
    de: 'Füllungsgrad der Speicherseen, wöchentlich, in GWh',
    fr: 'Taux de remplissage des retenues, hebdomadaire, en GWh',
    it: 'Grado di riempimento dei bacini di accumulazione, settimanale, in GWh',
    rm: 'Grad da emplenida dals lais da serra, mintga emna, en GWh',
  },
  'Discharge, water level and temperature at the federal gauges': {
    de: 'Abfluss, Wasserstand und Temperatur an den Messstellen des Bundes',
    fr: 'Débit, niveau et température aux stations fédérales',
    it: 'Portata, livello e temperatura alle stazioni federali',
    rm: 'Quantitad d’aua, nivel e temperatura a las staziuns federalas',
  },
  'Relief shading and the grey national map, optional ground': {
    de: 'Reliefschattierung und die graue Landeskarte, wahlweise als Untergrund',
    fr: 'Ombrage du relief et carte nationale grise, fond facultatif',
    it: 'Ombreggiatura del rilievo e carta nazionale grigia, sfondo facoltativo',
    rm: 'Sumbriva dal relief e la charta naziunala grischa, fund facultativ',
  },

  // ---- who holds it -------------------------------------------------------
  // The office is named as that office names itself in each language. The four
  // rows that repeat one string are the ones checked and left alone: a data set
  // published under one name in one language has one name.
  'BAFU': { de: 'BAFU', fr: 'OFEV', it: 'UFAM', rm: 'UFAM' },
  'BFE':  { de: 'BFE', fr: 'OFEN', it: 'UFE', rm: 'UFE' },
  'BAFU and the cantons': {
    de: 'BAFU und die Kantone', fr: 'OFEV et les cantons',
    it: 'UFAM e i Cantoni', rm: 'UFAM ed ils chantuns',
  },
  'the 26 cantons via geodienste.ch': {
    de: 'die 26 Kantone über geodienste.ch', fr: 'les 26 cantons via geodienste.ch',
    it: 'i 26 Cantoni tramite geodienste.ch', rm: 'ils 26 chantuns via geodienste.ch',
  },
  'HydroSHEDS / WWF, HydroRIVERS v1.0': {
    de: 'HydroSHEDS / WWF, HydroRIVERS v1.0', fr: 'HydroSHEDS / WWF, HydroRIVERS v1.0',
    it: 'HydroSHEDS / WWF, HydroRIVERS v1.0', rm: 'HydroSHEDS / WWF, HydroRIVERS v1.0',
  },
  'Natural Earth 10m': {
    de: 'Natural Earth 10m', fr: 'Natural Earth 10m', it: 'Natural Earth 10m', rm: 'Natural Earth 10m',
  },
  'GLAMOS': { de: 'GLAMOS', fr: 'GLAMOS', it: 'GLAMOS', rm: 'GLAMOS' },
  'swisstopo': { de: 'swisstopo', fr: 'swisstopo', it: 'swisstopo', rm: 'swisstopo' },
  'swisstopo, swissNAMES3D 2026': {
    de: 'swisstopo, swissNAMES3D 2026', fr: 'swisstopo, swissNAMES3D 2026',
    it: 'swisstopo, swissNAMES3D 2026', rm: 'swisstopo, swissNAMES3D 2026',
  },

  // ---- how often it is refreshed ------------------------------------------
  'none since': {
    de: 'seither keine Nachführung', fr: 'aucune mise à jour depuis',
    it: 'nessun aggiornamento da allora', rm: 'nagina actualisaziun dapi lura',
  },
  'none since the inventory': {
    de: 'seit dem Inventar keine', fr: 'aucune depuis l’inventaire',
    it: 'nessuno dall’inventario', rm: 'nagina dapi l’inventari',
  },
  'irregular': { de: 'unregelmässig', fr: 'irrégulière', it: 'irregolare', rm: 'irregulara' },
  'by revision of the ordinance annex': {
    de: 'mit jeder Revision des Verordnungsanhangs',
    fr: 'à chaque révision de l’annexe de l’ordonnance',
    it: 'a ogni revisione dell’allegato dell’ordinanza',
    rm: 'cun mintga revisiun da l’agiunta da l’ordinaziun',
  },
  'static': { de: 'statisch', fr: 'statique', it: 'statico', rm: 'statica' },
  'per canton, see the layer': {
    de: 'je Kanton, siehe Ebene', fr: 'par canton, voir la couche',
    it: 'per Cantone, vedi il livello', rm: 'per chantun, vesair il nivel',
  },
  'the inventories are episodic; lengths annual': {
    de: 'die Inventare episodisch, die Längen jährlich',
    fr: 'les inventaires sont épisodiques, les longueurs annuelles',
    it: 'gli inventari sono episodici, le lunghezze annuali',
    rm: 'ils inventaris èn episodics, las lunghezzas mintga onn',
  },
  'annual': { de: 'jährlich', fr: 'annuelle', it: 'annuale', rm: 'mintga onn' },
  'weekly': { de: 'wöchentlich', fr: 'hebdomadaire', it: 'settimanale', rm: 'mintga emna' },
  'every 10 minutes': {
    de: 'alle 10 Minuten', fr: 'toutes les 10 minutes',
    it: 'ogni 10 minuti', rm: 'mintga 10 minutas',
  },
  'periodic': { de: 'periodisch', fr: 'périodique', it: 'periodico', rm: 'periodica' },

  // ---- what class of claim it can support ---------------------------------
  'measured': { de: 'gemessen', fr: 'mesuré', it: 'misurato', rm: 'mesirà' },
  'modelled': { de: 'modelliert', fr: 'modélisé', it: 'modellizzato', rm: 'modellà' },
  'measured and modelled': {
    de: 'gemessen und modelliert', fr: 'mesuré et modélisé',
    it: 'misurato e modellizzato', rm: 'mesirà e modellà',
  },
  'register': { de: 'Register', fr: 'registre', it: 'registro', rm: 'register' },
  'survey': { de: 'Erhebung', fr: 'relevé', it: 'rilievo', rm: 'relevaziun' },
  'context': { de: 'Kontext', fr: 'contexte', it: 'contesto', rm: 'context' },

  // ---- the licence --------------------------------------------------------
  'opendata.swiss, attribution': {
    de: 'opendata.swiss, Quellenangabe', fr: 'opendata.swiss, mention de la source',
    it: 'opendata.swiss, indicazione della fonte', rm: 'opendata.swiss, inditgar la funtauna',
  },
  'FSDI general terms of use, free use with source attribution': {
    de: 'Allgemeine Nutzungsbedingungen BGDI, freie Nutzung mit Quellenangabe',
    fr: 'Conditions générales d’utilisation IFDG, utilisation libre avec mention de la source',
    it: 'Condizioni generali d’utilizzazione IFDG, uso libero con indicazione della fonte',
    rm: 'Cundiziuns generalas d’utilisaziun IFDG, diever liber cun inditgar la funtauna',
  },
  'Free for non-commercial and commercial use with attribution': {
    de: 'Frei für nicht kommerzielle und kommerzielle Nutzung mit Quellenangabe',
    fr: 'Libre pour un usage non commercial et commercial avec mention de la source',
    it: 'Libero per uso non commerciale e commerciale con indicazione della fonte',
    rm: 'Liber per in diever betg commerzial e commerzial cun inditgar la funtauna',
  },
  'Public domain': { de: 'Gemeinfrei', fr: 'Domaine public', it: 'Dominio pubblico', rm: 'Domena publica' },
  'per canton; all 26 currently publish this model freely': {
    de: 'je Kanton; derzeit publizieren alle 26 dieses Modell frei',
    fr: 'par canton ; les 26 publient actuellement ce modèle librement',
    it: 'per Cantone; attualmente tutti i 26 pubblicano liberamente questo modello',
    rm: 'per chantun; actualmain publitgeschan tut ils 26 quest model liberamain',
  },
  'CC BY 4.0 per the DOI index; the length-change file header adds "scientific and non-commercial use". Both statements stand.': {
    de: 'CC BY 4.0 gemäss DOI-Index; der Dateikopf der Längenänderungsreihe fügt «wissenschaftliche und nicht kommerzielle Nutzung» hinzu. Beide Angaben stehen nebeneinander.',
    fr: 'CC BY 4.0 selon l’index DOI ; l’en-tête du fichier des variations de longueur ajoute « usage scientifique et non commercial ». Les deux mentions subsistent.',
    it: 'CC BY 4.0 secondo l’indice DOI; l’intestazione del file delle variazioni di lunghezza aggiunge «uso scientifico e non commerciale». Entrambe le indicazioni restano.',
    rm: 'CC BY 4.0 tenor l’index DOI; il chau dal file da las midadas da lunghezza agiunta «diever scientific e betg commerzial». Omaduas indicaziuns valan.',
  },
  'Open data, free use with source attribution': {
    de: 'Open Data, freie Nutzung mit Quellenangabe',
    fr: 'Données ouvertes, utilisation libre avec mention de la source',
    it: 'Dati aperti, uso libero con indicazione della fonte',
    rm: 'Datas avertas, diever liber cun inditgar la funtauna',
  },
  'Open government data, no key': {
    de: 'Open Government Data, ohne Schlüssel', fr: 'Données publiques ouvertes, sans clé',
    it: 'Dati pubblici aperti, senza chiave', rm: 'Datas publicas avertas, senza clav',
  },

  // ---- the note under each source -----------------------------------------
  // What the source does not contain, which is the half a legend never states.
  'The low-flow reference the Water Protection Act runs on. Its age is not simply a defect: Art. 4(h) defines Q347 as a ten-year average, and the decade the cantons worked from is the one in this file. It is the legally operative figure and an obsolete description of the river at the same time.': {
    de: 'Der Niedrigwasser-Bezugswert, auf dem das Gewässerschutzgesetz beruht. Sein Alter ist nicht einfach ein Mangel: Art. 4 Bst. h GSchG definiert Q347 als Zehnjahresmittel, und das Jahrzehnt, mit dem die Kantone gearbeitet haben, ist jenes in dieser Datei. Es ist zugleich die rechtlich massgebende Zahl und eine überholte Beschreibung des Flusses.',
    fr: 'La référence d’étiage sur laquelle repose la loi sur la protection des eaux. Son âge n’est pas simplement un défaut : l’art. 4, let. h LEaux définit le Q347 comme une moyenne décennale, et la décennie sur laquelle les cantons ont travaillé est celle de ce fichier. C’est à la fois le chiffre juridiquement déterminant et une description périmée de la rivière.',
    it: 'Il riferimento di magra su cui poggia la legge sulla protezione delle acque. La sua età non è semplicemente un difetto: l’art. 4 lett. h LPAc definisce il Q347 come una media decennale, e il decennio su cui hanno lavorato i Cantoni è quello di questo file. È allo stesso tempo la cifra giuridicamente determinante e una descrizione superata del fiume.',
    rm: 'La referenza da l’aua bassa sin la quala la lescha davart la protecziun da las auas sa basa. Sia vegliadetgna n’è betg simplamain in mancament: l’art. 4 lit. h LPAuas definescha il Q347 sco media da diesch onns, e la decada cun la quala ils chantuns han lavurà è quella en quest file. Quai è a medem temp la cifra giuridicamain determinanta ed ina descripziun surpassada dal flum.',
  },
  'The inventory the cantons filed under GSchG Art. 80 ff. A licence granted, changed or restored since the data state is not in it. It carries no volume.': {
    de: 'Das Inventar, das die Kantone nach Art. 80 ff. GSchG eingereicht haben. Eine Konzession, die seit dem Datenstand erteilt, geändert oder saniert wurde, steht nicht darin. Es trägt keine Menge.',
    fr: 'L’inventaire déposé par les cantons au sens des art. 80 ss LEaux. Une concession accordée, modifiée ou assainie depuis l’état des données n’y figure pas. Il ne porte aucune quantité.',
    it: 'L’inventario depositato dai Cantoni ai sensi degli art. 80 segg. LPAc. Una concessione rilasciata, modificata o risanata dopo lo stato dei dati non vi figura. Non riporta alcuna quantità.',
    rm: 'L’inventari ch’ils chantuns han inoltrà tenor l’art. 80 ss. LPAuas. Ina concessiun concedida, midada u sanada dapi il status da las datas na stat betg vi. El na porta nagina quantitad.',
  },
  'From a survey of 2011, taken before the fourth treatment stage was built out. Every plant upgraded since is described here as it was before the upgrade.': {
    de: 'Aus einer Erhebung von 2011, vor dem Ausbau der vierten Reinigungsstufe. Jede seither ausgebaute Anlage wird hier so beschrieben, wie sie vor dem Ausbau war.',
    fr: 'D’un relevé de 2011, antérieur au déploiement de la quatrième étape de traitement. Toute station modernisée depuis est décrite ici telle qu’elle était avant.',
    it: 'Da un rilievo del 2011, precedente all’introduzione del quarto stadio di depurazione. Ogni impianto ammodernato da allora è qui descritto com’era prima.',
    rm: 'Ord ina relevaziun dal 2011, avant che la quarta staziun da nettegiada è vegnida construida. Mintga implant modernisà dapi lura vegn descrit qua sco ch’el era avant.',
  },
  'Drawn as a WMS image, not held as data. The page cannot query it, cannot check it, and reads its date from the same legend endpoint as every other federal layer.': {
    de: 'Als WMS-Bild gezeichnet, nicht als Daten gehalten. Die Seite kann es weder abfragen noch prüfen und liest sein Datum vom selben Legenden-Endpunkt wie jede andere Bundesebene.',
    fr: 'Dessiné comme image WMS, non conservé comme données. La page ne peut ni l’interroger ni le vérifier, et lit sa date au même point d’accès aux légendes que toute autre couche fédérale.',
    it: 'Disegnato come immagine WMS, non conservato come dati. La pagina non può interrogarlo né verificarlo, e ne legge la data dallo stesso endpoint delle legende di ogni altro livello federale.',
    rm: 'Dissegnà sco maletg WMS, betg tegnì sco datas. La pagina na po ni dumandar ni verifitgar el e legia sia data dal medem punct d’access da las legendas sco mintga auter nivel federal.',
  },
  'The one inventory on this map whose protection aim is stated as a quantity of water: Auenverordnung Art. 4 requires the natural dynamics of the water and sediment regime to be preserved. 415 reaches drawn here run through one of these objects.': {
    de: 'Das einzige Inventar auf dieser Karte, dessen Schutzziel als Wassermenge formuliert ist: Art. 4 der Auenverordnung verlangt die Erhaltung der natürlichen Dynamik des Gewässer- und Geschiebehaushalts. 415 hier gezeichnete Abschnitte verlaufen durch eines dieser Objekte.',
    fr: 'Le seul inventaire de cette carte dont le but de protection est énoncé comme une quantité d’eau : l’art. 4 de l’ordonnance sur les zones alluviales exige la conservation de la dynamique naturelle du régime hydrique et du charriage. 415 tronçons dessinés ici traversent un de ces objets.',
    it: 'L’unico inventario di questa carta il cui scopo di protezione è formulato come quantità d’acqua: l’art. 4 dell’ordinanza sulle zone golenali esige la conservazione della dinamica naturale del regime idrico e del trasporto solido. 415 tratti qui disegnati attraversano uno di questi oggetti.',
    rm: 'L’unic inventari sin questa charta che formulescha ses intent da protecziun sco ina quantitad d’aua: l’art. 4 da l’ordinaziun davart las zonas alluvialas pretenda la conservaziun da la dinamica natirala dal regim da l’aua e da la glera. 415 partidas dissegnadas qua passan tras in da quests objects.',
  },
  'Object number 1 is Rothenthurm, the site whose defence produced Art. 78(5) of the Constitution in 1987. The 89 objects cover about 875 km2, roughly 2 per cent of the country.': {
    de: 'Objekt Nummer 1 ist Rothenthurm, dessen Verteidigung 1987 zu Art. 78 Abs. 5 der Bundesverfassung geführt hat. Die 89 Objekte umfassen rund 875 km², etwa 2 Prozent des Landes.',
    fr: 'L’objet numéro 1 est Rothenthurm, dont la défense a produit en 1987 l’art. 78, al. 5 de la Constitution. Les 89 objets couvrent environ 875 km², soit quelque 2 pour cent du pays.',
    it: 'L’oggetto numero 1 è Rothenthurm, la cui difesa ha prodotto nel 1987 l’art. 78 cpv. 5 della Costituzione. Gli 89 oggetti coprono circa 875 km², all’incirca il 2 per cento del Paese.',
    rm: 'L’object numer 1 è Rothenthurm, il lieu che sia defensiun ha purtà l’art. 78 al. 5 da la Constituziun federala il 1987. Ils 89 objects cuvran var 875 km², radund 2 pertschient dal pajais.',
  },
  'Traced from a 15 arc-second grid, so its lines carry the staircase of the raster. The long-term mean it carries is a model output, not a gauge reading.': {
    de: 'Aus einem Raster von 15 Bogensekunden abgeleitet; seine Linien tragen deshalb die Treppe des Rasters. Das langjährige Mittel darin ist ein Modellergebnis und keine Messung.',
    fr: 'Tracé depuis une grille de 15 secondes d’arc : ses lignes portent donc l’escalier du raster. La moyenne à long terme qu’il porte est un résultat de modèle, non une mesure.',
    it: 'Tracciato da una griglia di 15 secondi d’arco: le sue linee portano quindi la scalinata del raster. La media a lungo termine che riporta è il risultato di un modello, non una misura.',
    rm: 'Tratg ord ina rait da 15 secundas d’artg, perquai portan sias lingias la stgala dal raster. La media da blers onns ch’el porta è in resultat d’in model e betg ina mesiraziun.',
  },
  'The clearest case of a register outliving its subject: it still carries Mühleberg as a power station, and its data state is the day Mühleberg was shut down. The page corrects it and shows the correction, rather than quietly dropping the site.': {
    de: 'Der klarste Fall eines Registers, das seinen Gegenstand überlebt: Es führt Mühleberg weiterhin als Kraftwerk, und sein Datenstand ist der Tag, an dem Mühleberg abgeschaltet wurde. Die Seite korrigiert das und zeigt die Korrektur, statt den Standort stillschweigend zu streichen.',
    fr: 'Le cas le plus net d’un registre qui survit à son objet : il porte toujours Mühleberg comme centrale, et son état des données est le jour de l’arrêt de Mühleberg. La page corrige et montre la correction, plutôt que de retirer le site en silence.',
    it: 'Il caso più netto di un registro che sopravvive al proprio oggetto: riporta ancora Mühleberg come centrale, e il suo stato dei dati è il giorno dello spegnimento di Mühleberg. La pagina corregge e mostra la correzione, invece di far sparire il sito in silenzio.',
    rm: 'Il cas il pli cler d’in register che surviva a ses object: el porta anc adina Mühleberg sco ovra, e ses status da las datas è il di che Mühleberg è vegnida serrada. La pagina curregia quai e mussa la correctura, empè da stizzar il lieu en il quiet.',
  },
  'Carries no reading. It is there so the water has a country to sit in.': {
    de: 'Trägt keine Messung. Sie ist da, damit das Wasser ein Land hat, in dem es liegt.',
    fr: 'Ne porte aucune mesure. Elle est là pour que l’eau ait un pays où se poser.',
    it: 'Non riporta alcuna misura. È lì perché l’acqua abbia un paese in cui stare.',
    rm: 'Na porta nagina mesiraziun. Ella è qua per che l’aua haja in pajais nua ch’ella po star.',
  },
  'There is no federal layer. This is 26 cantonal deliveries of the minimal geodata model Planerischer Gewaesserschutz aggregated into one service, so it has no single data state: the date given is the OLDEST cantonal delivery, because that is how old the picture actually is.': {
    de: 'Es gibt keine Bundesebene. Dies sind 26 kantonale Lieferungen des minimalen Geodatenmodells Planerischer Gewässerschutz, zu einem Dienst zusammengefasst; einen einzigen Datenstand gibt es deshalb nicht. Angegeben ist die ÄLTESTE kantonale Lieferung, denn so alt ist das Bild tatsächlich.',
    fr: 'Il n’existe pas de couche fédérale. Ce sont 26 livraisons cantonales du modèle de géodonnées minimal Planerischer Gewässerschutz agrégées en un seul service ; il n’y a donc pas d’état des données unique. La date indiquée est la livraison cantonale la PLUS ANCIENNE, car c’est l’âge réel de l’image.',
    it: 'Non esiste un livello federale. Si tratta di 26 consegne cantonali del modello di geodati minimo Planerischer Gewässerschutz aggregate in un unico servizio; non esiste quindi uno stato dei dati unico. La data indicata è la consegna cantonale PIÙ VECCHIA, perché è questa l’età reale dell’immagine.',
    rm: 'I na dat nagin nivel federal. Quai èn 26 furniziuns chantunalas dal model minimal da geodatas Planerischer Gewässerschutz, rimnadas en in sulet servetsch; i na dat pia nagin status da datas unic. La data inditgada è la furniziun chantunala LA PLI VEGLIA, perquai ch’uschè vegl è il maletg propi.',
  },
  'doi:10.18750/inventory.sgi1850.r1992, doi:10.18750/inventory.sgi2023.r2026, doi:10.18750/lengthchange.2025.r2025. The 2023 inventory was released in 2026 but describes the ice as it stood at the end of the 2023 melt season, and that is the date given here: what a source describes, not when it was published.': {
    de: 'doi:10.18750/inventory.sgi1850.r1992, doi:10.18750/inventory.sgi2023.r2026, doi:10.18750/lengthchange.2025.r2025. Das Inventar 2023 wurde 2026 veröffentlicht, beschreibt das Eis aber am Ende der Schmelzsaison 2023, und dieses Datum steht hier: was eine Quelle beschreibt, nicht wann sie publiziert wurde.',
    fr: 'doi:10.18750/inventory.sgi1850.r1992, doi:10.18750/inventory.sgi2023.r2026, doi:10.18750/lengthchange.2025.r2025. L’inventaire 2023 a été publié en 2026 mais décrit la glace à la fin de la saison de fonte 2023, et c’est cette date qui est donnée ici : ce qu’une source décrit, non le moment de sa publication.',
    it: 'doi:10.18750/inventory.sgi1850.r1992, doi:10.18750/inventory.sgi2023.r2026, doi:10.18750/lengthchange.2025.r2025. L’inventario 2023 è stato pubblicato nel 2026 ma descrive il ghiaccio alla fine della stagione di fusione 2023, ed è questa la data indicata qui: ciò che una fonte descrive, non quando è stata pubblicata.',
    rm: 'doi:10.18750/inventory.sgi1850.r1992, doi:10.18750/inventory.sgi2023.r2026, doi:10.18750/lengthchange.2025.r2025. L’inventari 2023 è vegnì publitgà il 2026, ma el descriva il glatsch a la fin da la stagiun da sfrender 2023, e quai è la data inditgada qua: quai ch’ina funtauna descriva, betg cura ch’ella è vegnida publitgada.',
  },
  'Structures, with the volume each reservoir holds when full. It carries no fill state, and never has.': {
    de: 'Bauwerke, mit dem Volumen, das jeder Speicher bei Vollstau fasst. Einen Füllungsgrad trägt das Register nicht und hat es nie getragen.',
    fr: 'Des ouvrages, avec le volume que chaque retenue contient à pleine capacité. Il ne porte aucun taux de remplissage, et n’en a jamais porté.',
    it: 'Opere, con il volume che ogni invaso contiene a pieno riempimento. Non riporta alcun grado di riempimento, e non l’ha mai fatto.',
    rm: 'Ovras, cun il volumen che mintga lai da serra cuntegna cun stanziada plaina. El na porta nagin grad da emplenida e n’al ha mai purtà.',
  },
  'Drawn as a WMS image. Which ground drains to which water; it carries no quantity.': {
    de: 'Als WMS-Bild gezeichnet. Welcher Boden zu welchem Gewässer entwässert; eine Menge trägt die Ebene nicht.',
    fr: 'Dessiné comme image WMS. Quel sol s’écoule vers quelle eau ; la couche ne porte aucune quantité.',
    it: 'Disegnato come immagine WMS. Quale suolo drena verso quale acqua; il livello non riporta alcuna quantità.',
    rm: 'Dissegnà sco maletg WMS. Tge terren che sa dertgira en tge aua; il nivel na porta nagina quantitad.',
  },
  'Protected by Art. 78(5) of the Federal Constitution. A third of the objects have no ring as large as 1.5 ha and are drawn as a mark rather than an outline.': {
    de: 'Geschützt durch Art. 78 Abs. 5 der Bundesverfassung. Bei einem Drittel der Objekte ist kein Ring so gross wie 1.5 ha; sie werden als Marke statt als Umriss gezeichnet.',
    fr: 'Protégés par l’art. 78, al. 5 de la Constitution fédérale. Un tiers des objets n’ont aucun anneau atteignant 1,5 ha et sont dessinés comme une marque plutôt que comme un contour.',
    it: 'Protetti dall’art. 78 cpv. 5 della Costituzione federale. Un terzo degli oggetti non ha alcun anello grande 1.5 ha ed è disegnato come un segno anziché come un contorno.',
    rm: 'Protegids tras l’art. 78 al. 5 da la Constituziun federala. In terz dals objects n’han nagin rintg da 1,5 ha e vegnan dissegnads sco marca e betg sco cuntur.',
  },
  'The largest of the mire inventories by object count, revised on the same day as the raised bogs.': {
    de: 'Das nach Objektzahl grösste der Moorinventare, revidiert am selben Tag wie die Hochmoore.',
    fr: 'Le plus grand des inventaires de marais par le nombre d’objets, révisé le même jour que les hauts-marais.',
    it: 'Il più grande degli inventari palustri per numero di oggetti, riveduto lo stesso giorno delle torbiere alte.',
    rm: 'Il pli grond dals inventaris palusters tenor il dumber d’objects, revedì il medem di sco las tuorbas autas.',
  },
  'Revised annually to the year’s end. It carries capacity and head but no water quantity, so the discharge on the map is derived by arithmetic.': {
    de: 'Jährlich auf das Jahresende revidiert. Es trägt Leistung und Fallhöhe, aber keine Wassermenge; der Abfluss auf der Karte wird deshalb rechnerisch hergeleitet.',
    fr: 'Révisé chaque année à la fin de l’année. Il porte la puissance et la hauteur de chute, mais aucune quantité d’eau : le débit sur la carte est donc dérivé par le calcul.',
    it: 'Riveduto ogni anno alla fine dell’anno. Riporta la potenza e il salto, ma nessuna quantità d’acqua: la portata sulla carta è quindi derivata per calcolo.',
    rm: 'Revedì mintg’onn a la fin da l’onn. El porta la pussanza e l’autezza da crudada, ma nagina quantitad d’aua; la quantitad d’aua sin la charta vegn perquai derivada cun il quen.',
  },
  'A gazetteer of name placements, not of named geometries. Each anchor is joined to the nearest drawn reach, which is what gives a name its rank and its angle. The join fails predictably where a canal runs within 200 m of a trunk river: build/10-names.mjs names the cases it gets wrong rather than hiding them.': {
    de: 'Ein Verzeichnis von Namenspositionen, nicht von benannten Geometrien. Jeder Ankerpunkt wird dem nächstgelegenen gezeichneten Abschnitt zugeordnet, und daraus ergeben sich Rang und Winkel eines Namens. Die Zuordnung scheitert vorhersehbar, wo ein Kanal innerhalb von 200 m neben einem Hauptfluss verläuft: build/10-names.mjs benennt die Fälle, die es falsch macht, statt sie zu verbergen.',
    fr: 'Un répertoire de positions de noms, non de géométries nommées. Chaque ancre est jointe au tronçon dessiné le plus proche, ce qui donne à un nom son rang et son angle. La jointure échoue de manière prévisible là où un canal longe une rivière principale à moins de 200 m : build/10-names.mjs nomme les cas qu’il manque au lieu de les cacher.',
    it: 'Un repertorio di posizioni di nomi, non di geometrie denominate. Ogni ancoraggio è unito al tratto disegnato più vicino, ed è questo a dare a un nome il suo rango e il suo angolo. L’unione fallisce in modo prevedibile dove un canale corre entro 200 m da un fiume principale: build/10-names.mjs nomina i casi che sbaglia invece di nasconderli.',
    rm: 'In register da posiziuns da noms e betg da geometrias numnadas. Mintga anker vegn collià cun la partida dissegnada la pli datiers, e quai dat ad in num ses rang e ses angul. La colliaziun fallescha en moda predivinabla là nua ch’in chanal passa a main che 200 m dad in flum principal: build/10-names.mjs numna ils cas ch’el fa fallads empè da zuppar els.',
  },
  'Only the fixed objects are drawn. The inventory also lists mobile objects, which are gravel and clay pits whose protected sites move as the works move, and a boundary for those would be a fiction.': {
    de: 'Gezeichnet werden nur die ortsfesten Objekte. Das Inventar führt auch Wanderobjekte, also Kies- und Lehmgruben, deren geschützte Stellen mit dem Abbau wandern; eine Grenze dafür wäre eine Fiktion.',
    fr: 'Seuls les objets fixes sont dessinés. L’inventaire liste aussi des objets itinérants, gravières et glaisières dont les sites protégés se déplacent avec l’exploitation ; en tracer la limite serait une fiction.',
    it: 'Sono disegnati solo gli oggetti fissi. L’inventario elenca anche oggetti itineranti, cave di ghiaia e d’argilla i cui siti protetti si spostano con l’estrazione; tracciarne il confine sarebbe una finzione.',
    rm: 'Mo ils objects fixs vegnan dissegnads. L’inventari fa era ina glista dals objects mobils, quai vul dir chavuras da grava e d’arschiglia, nua ch’ils lieus protegids sa spostan cun il stgav; ina cunfinaziun per quels fiss ina finziun.',
  },
  'The file allows only map.geo.admin.ch to read it from a browser, so it is baked in at build time. The Pages workflow rebuilds weekly to keep the baked copy fresh.': {
    de: 'Die Datei lässt sich im Browser nur von map.geo.admin.ch lesen und wird deshalb beim Build eingebacken. Der Pages-Workflow baut wöchentlich neu, damit die eingebackene Kopie frisch bleibt.',
    fr: 'Le fichier ne se laisse lire depuis un navigateur que par map.geo.admin.ch : il est donc figé au moment du build. Le workflow Pages reconstruit chaque semaine pour garder cette copie fraîche.',
    it: 'Il file si lascia leggere da un browser solo da map.geo.admin.ch: è quindi incorporato al momento del build. Il workflow Pages ricostruisce ogni settimana per mantenere fresca la copia incorporata.',
    rm: 'Il file sa laschar leger en in navigatur mo da map.geo.admin.ch, perquai vegn el integrà durant il build. Il workflow Pages construescha danovamain mintga emna per tegnair frestga questa copia.',
  },
  'The only live source on the page. Its age is the age of the last reading, shown in the title bar.': {
    de: 'Die einzige Livequelle der Seite. Ihr Alter ist das Alter der letzten Messung; es steht in der Titelzeile.',
    fr: 'La seule source en direct de la page. Son âge est celui de la dernière mesure, indiqué dans la barre de titre.',
    it: 'L’unica fonte in diretta della pagina. La sua età è quella dell’ultima misura, indicata nella barra del titolo.',
    rm: 'L’unica funtauna en direct da la pagina. Sia vegliadetgna è quella da l’ultima mesiraziun, inditgada en la lingia dal titel.',
  },
  'Both are off unless asked for and neither carries a reading. They are here so a site can be found on the ground, not so anything can be measured from them.': {
    de: 'Beide sind ausgeschaltet, solange sie nicht verlangt werden, und keine trägt eine Messung. Sie sind da, damit ein Ort im Gelände gefunden werden kann, nicht damit daraus etwas gemessen wird.',
    fr: 'Les deux sont désactivés tant qu’on ne les demande pas et aucun ne porte de mesure. Ils sont là pour qu’un site puisse être retrouvé sur le terrain, non pour qu’on y mesure quoi que ce soit.',
    it: 'Entrambi sono spenti finché non vengono richiesti e nessuno dei due riporta una misura. Sono qui perché un sito possa essere ritrovato sul terreno, non perché vi si misuri qualcosa.',
    rm: 'Omadus èn deactivads uschè ditg ch’els na vegnan betg dumandads e nagin dals dus na porta ina mesiraziun. Els èn qua per ch’in lieu possia vegnir chattà en il terren, betg per mesirar insatge ord els.',
  },

  // ---- where Swiss water goes ---------------------------------------------
  // The four seas, the rivers that carry the water to them, and the states that
  // share the basin. The states are also counted, by splitting this same string,
  // so a name that appears in two lists is written the same way in both.
  'North Sea':     { de: 'Nordsee', fr: 'Mer du Nord', it: 'Mare del Nord', rm: 'Mar dal Nord' },
  'Mediterranean': { de: 'Mittelmeer', fr: 'Méditerranée', it: 'Mediterraneo', rm: 'Mar Mediterran' },
  'Adriatic':      { de: 'Adria', fr: 'Adriatique', it: 'Adriatico', rm: 'Mar Adriatic' },
  'Black Sea':     { de: 'Schwarzes Meer', fr: 'Mer Noire', it: 'Mar Nero', rm: 'Mar Nair' },
  'the Rhine': { de: 'den Rhein', fr: 'le Rhin', it: 'il Reno', rm: 'il Rain' },
  'the Rhone': { de: 'die Rhone', fr: 'le Rhône', it: 'il Rodano', rm: 'il Rodan' },
  'the Ticino and the Po, and the Rom and the Adige': {
    de: 'den Ticino und den Po sowie den Rom und die Etsch',
    fr: 'le Tessin et le Pô, ainsi que le Rom et l’Adige',
    it: 'il Ticino e il Po, e il Rom e l’Adige',
    rm: 'il Tessin ed il Po, ed il Rom e l’Adige',
  },
  'the Inn and the Danube': {
    de: 'den Inn und die Donau', fr: 'l’Inn et le Danube',
    it: 'l’Inn e il Danubio', rm: 'l’En ed il Danubi',
  },
  'Liechtenstein, Austria, Germany, France, Luxembourg, Belgium, the Netherlands, Italy': {
    de: 'Liechtenstein, Österreich, Deutschland, Frankreich, Luxemburg, Belgien, die Niederlande, Italien',
    fr: 'le Liechtenstein, l’Autriche, l’Allemagne, la France, le Luxembourg, la Belgique, les Pays-Bas, l’Italie',
    it: 'il Liechtenstein, l’Austria, la Germania, la Francia, il Lussemburgo, il Belgio, i Paesi Bassi, l’Italia',
    rm: 'il Liechtenstein, l’Austria, la Germania, la Frantscha, il Luxemburg, la Belgia, ils Pajais Bass, l’Italia',
  },
  'France': { de: 'Frankreich', fr: 'la France', it: 'la Francia', rm: 'la Frantscha' },
  'Italy':  { de: 'Italien', fr: 'l’Italie', it: 'l’Italia', rm: 'l’Italia' },
  'Austria, Germany, Slovakia, Hungary, Croatia, Serbia, Bulgaria, Romania, Moldova, Ukraine': {
    de: 'Österreich, Deutschland, die Slowakei, Ungarn, Kroatien, Serbien, Bulgarien, Rumänien, Moldau, die Ukraine',
    fr: 'l’Autriche, l’Allemagne, la Slovaquie, la Hongrie, la Croatie, la Serbie, la Bulgarie, la Roumanie, la Moldavie, l’Ukraine',
    it: 'l’Austria, la Germania, la Slovacchia, l’Ungheria, la Croazia, la Serbia, la Bulgaria, la Romania, la Moldova, l’Ucraina',
    rm: 'l’Austria, la Germania, la Slovachia, l’Ungaria, la Croazia, la Serbia, la Bulgaria, la Rumenia, la Moldova, l’Ucraina',
  },
  'Rees, above the Dutch border': {
    de: 'Rees, oberhalb der niederländischen Grenze',
    fr: 'Rees, en amont de la frontière néerlandaise',
    it: 'Rees, a monte del confine olandese',
    rm: 'Rees, avant il cunfin ollandais',
  },
  // A citation is given in the language of the document cited. The Rhine
  // commission published this plan in German; naming it in four languages would
  // send a reader looking for four documents, of which three do not exist.
  'Internationale Kommission zum Schutz des Rheins, International koordinierter Bewirtschaftungsplan 2022–2027 für die internationale Flussgebietseinheit Rhein, Teil A, März 2022, Tabelle 1': {
    fr: 'Internationale Kommission zum Schutz des Rheins, International koordinierter Bewirtschaftungsplan 2022–2027 für die internationale Flussgebietseinheit Rhein, Teil A, März 2022, Tabelle 1',
    it: 'Internationale Kommission zum Schutz des Rheins, International koordinierter Bewirtschaftungsplan 2022–2027 für die internationale Flussgebietseinheit Rhein, Teil A, März 2022, Tabelle 1',
    rm: 'Internationale Kommission zum Schutz des Rheins, International koordinierter Bewirtschaftungsplan 2022–2027 für die internationale Flussgebietseinheit Rhein, Teil A, März 2022, Tabelle 1',
  },

  // ---- the five wetland inventories ---------------------------------------
  'Alluvial zones': {
    de: 'Auengebiete', fr: 'Zones alluviales', it: 'Zone golenali', rm: 'Zonas alluvialas',
  },
  'Raised and transitional bogs': {
    de: 'Hoch- und Übergangsmoore', fr: 'Hauts-marais et marais de transition',
    it: 'Torbiere alte e di transizione', rm: 'Palis auts e da transiziun',
  },
  'Fens': { de: 'Flachmoore', fr: 'Bas-marais', it: 'Torbiere basse', rm: 'Palis bass' },
  'Amphibian spawning sites': {
    de: 'Amphibienlaichgebiete', fr: 'Sites de reproduction de batraciens',
    it: 'Siti di riproduzione degli anfibi', rm: 'Lieus da reproducziun d’amfibis',
  },
  'Mire landscapes': {
    de: 'Moorlandschaften', fr: 'Sites marécageux',
    it: 'Paesaggi palustri', rm: 'Cuntradas palustras',
  },

  // ---- the ordinance each inventory rests on ------------------------------
  // Keyed by the German short title, which is what the data file carries, so no
  // German row is needed. The SR number is printed beside it either way, and the
  // SR number is what a reader looks the text up by.
  'Auenverordnung': {
    fr: 'Ordonnance sur les zones alluviales', it: 'Ordinanza sulle zone golenali',
    rm: 'Ordinaziun davart las zonas alluvialas',
  },
  'Hochmoorverordnung': {
    fr: 'Ordonnance sur les hauts-marais', it: 'Ordinanza sulle torbiere alte',
    rm: 'Ordinaziun davart ils palis auts',
  },
  'Flachmoorverordnung': {
    fr: 'Ordonnance sur les bas-marais', it: 'Ordinanza sulle torbiere basse',
    rm: 'Ordinaziun davart ils palis bass',
  },
  'Amphibienlaichgebiete-Verordnung': {
    fr: 'Ordonnance sur les batraciens', it: 'Ordinanza sui siti di riproduzione degli anfibi',
    rm: 'Ordinaziun davart ils lieus da reproducziun d’amfibis',
  },
  'Moorlandschaftsverordnung': {
    fr: 'Ordonnance sur les sites marécageux', it: 'Ordinanza sui paesaggi palustri',
    rm: 'Ordinaziun davart las cuntradas palustras',
  },

  // ---- the object type, as the inventory writes it -------------------------
  'Alpine Schwemmebene': {
    fr: 'Plaine alluviale alpine', it: 'Piana alluvionale alpina', rm: 'Planira alluviala alpina',
  },
  'Delta': { fr: 'Delta', it: 'Delta', rm: 'Delta' },
  'Fliessgewässer': { fr: 'Cours d’eau', it: 'Corso d’acqua', rm: 'Aua currenta' },
  'Gletschervorfeld': {
    fr: 'Marge proglaciaire', it: 'Area proglaciale', rm: 'Territori davant il glatscher',
  },
  'Hochmoorumfeld': {
    fr: 'Zone environnante du haut-marais', it: 'Zona circostante della torbiera alta',
    rm: 'Contuorn dal palì aut',
  },
  'Offene Wasserfläche': {
    fr: 'Plan d’eau libre', it: 'Superficie d’acqua libera', rm: 'Surfatscha d’aua averta',
  },
  'Primäre Hochmoorfläche': {
    fr: 'Surface primaire de haut-marais', it: 'Superficie primaria di torbiera alta',
    rm: 'Surfatscha primara da palì aut',
  },
  'Sekundäre Hochmoorfläche': {
    fr: 'Surface secondaire de haut-marais', it: 'Superficie secondaria di torbiera alta',
    rm: 'Surfatscha secundara da palì aut',
  },
  'Seeufer': { fr: 'Rive lacustre', it: 'Riva lacustre', rm: 'Riva dal lai' },
  'Bereich A (dient der Fortpflanzung der Amphibien – alle Gewässer welche sicher oder potentiell der Fortpflanzung dienen)': {
    fr: 'Secteur A (sert à la reproduction des batraciens – toutes les eaux qui servent certainement ou potentiellement à la reproduction)',
    it: 'Settore A (serve alla riproduzione degli anfibi – tutte le acque che servono con certezza o potenzialmente alla riproduzione)',
    rm: 'Sectur A (serva a la reproducziun dals amfibis – tut las auas che servan segir u eventualmain a la reproducziun)',
  },
  'Bereich B (Nährstoffpufferzone und engerer Landlebensraum angrenzend an das Fortpflanzungsgewässer)': {
    fr: 'Secteur B (zone tampon contre les apports d’éléments nutritifs et habitat terrestre restreint attenant au plan d’eau de reproduction)',
    it: 'Settore B (zona tampone per i nutrienti e habitat terrestre ristretto adiacente all’acqua di riproduzione)',
    rm: 'Sectur B (zona tampun per las substanzas nutritivas e spazi vital terrester stretg dasperas a l’aua da reproducziun)',
  },

  // ---- the nuclear stations ------------------------------------------------
  'operating': { de: 'in Betrieb', fr: 'en exploitation', it: 'in esercizio', rm: 'en funcziun' },
  'shut down': {
    de: 'stillgelegt', fr: 'arrêtée définitivement',
    it: 'spenta definitivamente', rm: 'serrada definitivamain',
  },
  'Shut down on 20 December 2019. Free of nuclear fuel since September 2023, after 418 fuel elements were moved to the interim store at Würenlingen in 66 transports, which removed over 99 % of the radioactivity on site. Nuclear dismantling is planned to be complete at the end of 2031 and the site released for other use from 2034. It no longer abstracts cooling water at operating volumes.': {
    de: 'Am 20. Dezember 2019 abgeschaltet. Seit September 2023 brennstofffrei, nachdem 418 Brennelemente in 66 Transporten ins Zwischenlager Würenlingen gebracht wurden, womit über 99 % der Radioaktivität vom Standort verschwunden sind. Der nukleare Rückbau soll Ende 2031 abgeschlossen sein und das Areal ab 2034 für andere Nutzungen freigegeben werden. Kühlwasser entnimmt die Anlage nicht mehr in Betriebsmengen.',
    fr: 'Arrêtée le 20 décembre 2019. Sans combustible nucléaire depuis septembre 2023, après le transfert de 418 éléments combustibles au dépôt intermédiaire de Würenlingen en 66 transports, ce qui a retiré du site plus de 99 % de la radioactivité. Le démantèlement nucléaire doit être achevé fin 2031 et le site libéré pour d’autres usages dès 2034. Elle ne prélève plus d’eau de refroidissement en quantités d’exploitation.',
    it: 'Spenta il 20 dicembre 2019. Priva di combustibile nucleare da settembre 2023, dopo il trasferimento di 418 elementi di combustibile al deposito intermedio di Würenlingen in 66 trasporti, che ha rimosso dal sito oltre il 99 % della radioattività. Lo smantellamento nucleare dovrebbe concludersi alla fine del 2031 e il sito essere liberato per altri usi dal 2034. Non preleva più acqua di raffreddamento in quantità d’esercizio.',
    rm: 'Serrada ils 20 da december 2019. Senza combustibel nuclear dapi settember 2023, suenter che 418 elements da combustibel èn vegnids manads en 66 transports al deposit intermediar da Würenlingen, quai che ha allontanà dal lieu passa 99 % da la radioactivitad. La demoliziun nucleara duai esser terminada a la fin dal 2031 ed il lieu vegnir liberà per auters dievers a partir dal 2034. Ella na prenda betg pli aua da refradaziun en quantitads da funcziunament.',
  },

  // ---- the hydropower register, as WASTA writes it -------------------------
  'Laufkraftwerk': {
    fr: 'Centrale au fil de l’eau', it: 'Impianto ad acqua fluente', rm: 'Ovra al fil da l’aua',
  },
  'Speicherkraftwerk': {
    fr: 'Centrale à accumulation', it: 'Impianto ad accumulazione', rm: 'Ovra da stanziada',
  },
  'Pumpspeicherkraftwerk': {
    fr: 'Centrale de pompage-turbinage', it: 'Impianto di pompaggio', rm: 'Ovra da pumpa-stanziada',
  },
  'reines Umwälzwerk': {
    fr: 'Pompage-turbinage pur', it: 'Pompaggio puro', rm: 'Pumpa-stanziada pura',
  },
  'im Normalbetrieb': {
    fr: 'en exploitation normale', it: 'in esercizio normale', rm: 'en funcziun normala',
  },
  'im Bau': { fr: 'en construction', it: 'in costruzione', rm: 'en construcziun' },
  'im Umbau': { fr: 'en transformation', it: 'in trasformazione', rm: 'en transformaziun' },
  'ausser Betrieb/reduzierter Betrieb': {
    fr: 'hors service / exploitation réduite', it: 'fuori esercizio / esercizio ridotto',
    rm: 'ord funcziun / funcziun reducida',
  },

  // ---- the register of dams under federal supervision ----------------------
  'Bogenmauer':          { fr: 'Barrage-voûte', it: 'Diga ad arco', rm: 'Mir en arc' },
  'Bogengewichtsmauer':  { fr: 'Barrage-poids-voûte', it: 'Diga ad arco-gravità', rm: 'Mir en arc da pais' },
  'Bogenreihenmauer':    { fr: 'Barrage à voûtes multiples', it: 'Diga a volte multiple', rm: 'Mir cun plirs arcs' },
  'Gewichtsmauer':       { fr: 'Barrage-poids', it: 'Diga a gravità', rm: 'Mir da pais' },
  'Pfeilermauer':        { fr: 'Barrage à contreforts', it: 'Diga a speroni', rm: 'Mir cun pilasters' },
  'Erdschüttdamm':       { fr: 'Digue en terre', it: 'Diga in terra', rm: 'Dom da terra' },
  'Steinschüttdamm':     { fr: 'Digue en enrochement', it: 'Diga in pietrame', rm: 'Dom da crappa' },
  'Wehr':                { fr: 'Seuil', it: 'Traversa', rm: 'Serra' },
  'Hydroelektrizität':   { fr: 'Hydroélectricité', it: 'Idroelettricità', rm: 'Idroelectricitad' },
  'Wasserversorgung':    { fr: 'Approvisionnement en eau', it: 'Approvvigionamento idrico', rm: 'Provediment d’aua' },
  'Hochwasserrückhalt, Geschiebesperre': {
    fr: 'Rétention des crues, barrage à sédiments', it: 'Ritenuta delle piene, briglia di trattenuta',
    rm: 'Retenziun da las auas grondas, serra da glera',
  },
  'Erholung, Biotop':    { fr: 'Loisirs, biotope', it: 'Svago, biotopo', rm: 'Recreaziun, biotop' },
  'Andere Verwendung':   { fr: 'Autre usage', it: 'Altro uso', rm: 'Auter diever' },

  // ---- where this week sits in the record ---------------------------------
  'below the tenth percentile': {
    de: 'unter dem zehnten Perzentil', fr: 'sous le dixième centile',
    it: 'sotto il decimo percentile', rm: 'sut il decim percentil',
  },
  'above the ninetieth percentile': {
    de: 'über dem neunzigsten Perzentil', fr: 'au-dessus du nonantième centile',
    it: 'sopra il novantesimo percentile', rm: 'sur il navantavel percentil',
  },
  'inside the usual range': {
    de: 'im üblichen Bereich', fr: 'dans la fourchette habituelle',
    it: 'nell’intervallo abituale', rm: 'en il diapason usità',
  },
  'unknown': { de: 'unbekannt', fr: 'inconnu', it: 'sconosciuto', rm: 'nunenconuschent' },
});
