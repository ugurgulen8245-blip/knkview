# Çeviriler

`_master.json` tek kaynak: her Türkçe metin için `en`, `fr`, `hi`, `zh`, `ko` karşılıkları.
`{0}`, `{1}` yer tutucuları her dilde aynı olmalı. Düzenledikten sonra dil dosyalarını üret:

    node i18n/build.mjs
