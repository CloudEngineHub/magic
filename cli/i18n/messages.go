//go:generate ./gen.sh
package i18n

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"io"
	"os"
	"strings"

	"go.yaml.in/yaml/v3"
	"golang.org/x/text/language"
	"golang.org/x/text/message"

	"github.com/klauspost/compress/zstd"
)

// the content is from messages.yml, donot change it here.
var messagesYAMLZstdBase64 string = `
KLUv/QRoJbcAmoYgHUjg7roB8JOUydjADDPMMEPxhMZB+rnZTCCtUbXzPHjZtiU/rjY++YgtlVmy
zW/6k5ITBr7Lep4XFqwnojSsmTxmn2rEGA0xxgG+AcEB0AEaZYENDtIGRydBSrzsW48fV8QdIj53
gQKjcXQJXA7S3ZrAzSUT7/Ok9wMPmXQXYFwumsIArh+Qd8MfGohmRjZhChiwFK+z8gduAZ45JssM
0jVzSeD2koYwwx0xYuy4g4ucPkoSk2RwDEE0c4gQJikh8xBSiBAjRuRSBHuQ7ggZIgRG7rg8TRmE
h5xlhoC3iA5zsM/D8mUpWpgfEHe8wc+8MSvyNbPP6/mXlS9pCR3nrZFy4tPcjHxjkxlCUgPU9txO
ZD9HxMJUwZ6uRI6YIs4eqBMRMLXxLjmfs7E8mz1vdG2aOCTqAXV47d24lnexvmz1hVS+RsijqP2r
xRO/NT0gatOmakEitdXFPC7994q4GF1rD57ROcoSd25yoDYICk84aVSCoB5QR9SqaFpWzrd4Eims
LceqXv6kqHVJBVNagirMZ9W+zccs4Q4h7tjagalJzknTzh3axLj1gEQq/mVrU4pa0cQmk9YwzdPm
7YA1IuDlGhBkEHCLiIAv3woWIp97YXs7oNDq40ywspgXQmlZfr7M7G9yI5s0hJJJ9p4fbL13nvES
j4xWaipGF6PDxhPyafd7AWBwE0PYMIIAEDiun6ES8yMnS5FTR95d5MT5STvomkKCkVGDkNiBhYUJ
l6BQzM9SwZwbA5LMSazG0ByNDpAOkBCQpFi/X3SyhOqbFC9GrR1QpuVbVrTar534r51frXgeMCX2
NzIaQFghImNq/wJV9rFEmrwXfzFG5aiGhZXtsL8d9kQGFZKl7gCh7fgVHwvbAfMYYg1NgeX6QWV5
Xlx8ELk7dwi1qKbadITqXXMOJXj3TJ48lOcom9ocXYsCBEa6n/AIfX2dCZZP5q/82pVvRcznbbhv
w/MvRW0W9QTO8y7pbcADqosGNEna4VhK+VgY6wM5kncHB87Wvkh43M/nWXk0FcSh/JGfOkxOnBjE
VF9jCZawiczpsT08KBHnXWaw6FoYHn8z+7AeMGj2Yz22cwmp2g/xERJXLHZnCy6+FTw37A8JT1Jq
nj14ZD93LJ4hvBM/W/nOSQkjEVfzKFZtaqej/VuupfVMfl4n1JZ2hkli04+WplYd+m1FQBMXFoUH
/FF5l5sHevn34uKOQvLUICXutJkgTsvndqkej1N5cefR5OA5xCfPnRwvbBATKeJy0pAtyErxEi4d
lDjUEkYj2c3DzAQzCYYgluQYJugqg64xdHWhqytdTdRVZyi9pTSwXU+6quqqoq5ousagqwm6vtAV
BxeTY6nrCXX9SdcWG3TFoSvp+oKuP3SFoesNupZI1xx1XamrLl1RqCtNup6oq4z6oq45NChdfepq
o64dETZgDj24EiVk0KCQzQ7og3PiF5SyO5avkgaxsCnKLSdTPSvlWyqeJqeerHxfCxvT0rpSHk2t
J6xWrm0N/dpL8NbDtuB0inzaogLFdr72ldP6AAXp8HxM/M9J67qRof0SQjY47Yzmf2AwPbieL6OS
k9PqbEGf7NdmQR8Y+7LpDMXEqGSCOxRmM9HVtHDtyU8L9EPDtS4ddsbyTeT8HVybyvFmWFwwsxqP
ggZjLRQlhGI8L2VNXkFVqp39bCZsF0k6WZ4fu1yLqnxOTMwlOpsVUKVZQYOM4elDUxgw4kOyP+BE
gYg4BeNzRGxO7Z/AePFVwos9f4xdM/jQ6bC1onbleb4cvlKChki4fo0OpQfc0bQbi+RabHa+w9Yl
GLKXd914mJXnqXXS5NBn3iop/iJlx0Bpa1I2YKD38ZdrUzaWFyNbfY4ZdPIBC+zk9VW9FZ5f6QEl
eIRsoNA+D43f2QFLE4pUkndIuviAJHhwajAdh+QIGebesxmioJtkppC7NnHSpDcHMWHz4nvCHJnn
U4lJSOXFW5MkeARBlpgkPc7QQluIm5f8YhFrXNIluUlec+MyzOJ5b5k/Lv+QOUrkbnxmfskJfAyx
eOJ7796ncOTX4ryhmceSO6JPfXceyR4iP8/TR4HzErimSyqR8rU4UbskZpHRApNkkmeym9m00TEv
T3gkb2iUkC6+/aRF8MWmvPUI77fEIrp8cLl4UaGZy5vD0y0RNfLWpebk2G82L+qkMZjGTpacl7wW
59UUwuvBsQVq6x7mO96d+en2XLq634+QDWZWuaErAl1riKXyNnTF8WGxVtDcLeVjav+1Q9fborP1
tD+dp8FU/iXnY1K4luZES9353BD6aq0878XyT24tqq6ynZqf4oFkPOvmYzG/GK0HdO2ANb2cop10
hVHXFDNE/qXlczOwf2lq1CEUrBWbSUvqZbxcy2p3e2RubHY7j+LgbO2Nik116MoDxP7gmKR4nQma
msJzo65C6poj68GgK85qBndvUVoEnJEFVx9Fuu7E6KCr79cWoetOTpuzqesrTdNUVeSHWGyHM6ij
uj2PMWdGRJIkSWMzcRAYFhbQRpPhKH+jFHmwmMMhhoUQkCHGEIQMIcQQIjCMjIiICVHSAbm2Bo9c
x3oi06OyU9wD5ikkuzwRPNht5/QHz2fPY4OKKPoWNZObBwq8ERSBSJNnwOANrNNRUF7LsEG80OwH
rae8DiUkJqeBsIsx5MJS1MI7MsSyfbtQ2gVBRlRab0o2kzCwbEw9dGZsfyPM/BAHz8TM7tUb02cz
suGZqKn8ZxfLjt+XGj2gRXGk+ed008IVZfvRhYROAVaLUNRMYMBAZhPHFjUxNOrnpl87TN6ItKAM
J+RpUMWO7rZzIAQnyfx6x/6PutcS4TfTcTxgPkHw8I3vUUd9OqFT2ytnkWuObiL1qtXKsA2sPKeH
PtD2adHwnMI8y/H4+aklBs8JngGDswVTL1vi0FCsbtOJ4dSWvARKCimn+sZudtpAeeoIMpyZ0vHK
pB+HfBCvC8toFI5iVxnN5CpEQwqshtBHVKkpduBNnOIez6dqNAn+KeUPzHYr6vSxd5OcarCtDK99
zh2FbhkXuG/jZymhp8bd5vx834jSOap2BeF2aUKuIxgpxWhE6DljlE81CD5Y115vjklf+hU8m+5N
5jS/sUCXBA3hWjTq1Rgw2kBL5slUHQPNXQ/R+QVnh+O7+Ptkwi+qsvzKt89lmCqasJsrt1VW0ptj
VA+y1Q6pOJGfIx7szXpVcGHnh+FAdwb3TQ/4IkxUVIfWZGz5kD+MPpZV7yxtkJJVj3pBcjOzekZJ
MytYpsxK8jJo7X18Yn3aQFed3FHCdlYySu55wfLd9cCPGAsywVY8OIiFedSsRwuqU2E/Z2yFgRHU
OWs5P1R9ZbdLp1xds1IughYRP41yPlVoN63Mtv1ggGbdZXVM80hpdWNsIZkQfmYgbEVi2/XWbafb
Uirlp6gCg1s4SZ0U66yx8VYo2AyJHLe82rJnm38l4Sx96XNf2+pa+1t3yt0oszhqLA3DpBsH1EBC
zl3neTjwalm6dhf8dmXE+7j6lHndGuy82PJVyPzbvNbKoAQuNnuvhYLyXXHzvbmKUtjni/1Uwi0r
fQc6qwB7EFXJN0y5n1hV+6qaTn8IU3AgEPOxYdHcAxZqCf9vMd4GqDVxVCX9gDXmR3kiq33YVmXb
uz0ALACVjKkwWFroa8WGWZg/YYQzgO/S1LC4sBPlD09L9nGiscojYne0Bo58XDUxPznjTryq/Paw
4qgQTF5QbR3CJna3ZKsdJXosJh/2tyDmSuQW0qWGe4ieJqeNNex2JUeUCP8FtuWU2n4in28MbwY5
cbYIoINWcsz3yKY20LZMTSsqw/+WwKKLw8XrfZoJvub0FGk9AW9wRl9pp202/OTWg8E7p/9OcHzE
TTqBDLHmripPiKC1eRIhCZFVIoYW8OyjgNoroZWR2msI7XOljtLm7Qbafaa2RpP9+7iumNK5RBkr
vgJqG5rzGi/vrdeCgpKozYamKfrTY2idXMlPCI12O7n9Ev886HBVu2ugbf4fGfFXp7k9n8Zmw0aN
d9fpD28qJvLR1J8wcclOb7FriYcdXJ+B11ABTaRiCdo8/ekPjN1QqOfcn/fBWGXo18yAphxRr9o2
NQVLGdNctI9zSgYN7jJ/KLovCGIEzpZT7YWOwykRAizTed0+BKAssc03OaIyF/9x+Y99EmCVAk7z
LXIECHw1AgHv6gibxxgIhvbivyeDeMEQ41VKP3s7lPe7rFx+pXd+YSbox2JVhHqs9WXizx4+LQQj
HhKQisofyzIceoxUILSkyu/mI+U0J+auBaCoaIORJZdNIfPFY+gQSCdMMESYzYkzIoMGkYHJYbMM
PBiUJtl2IMsFk7OWyApmK2IuNE8AVd9XumGMAlEMWYYpeMumTfEdZLbYn3+zvihf8k+MXgua8PZI
HZPWeb+5Cf2QZQhOTicbeDf0wV1YsAv9OHuq2xatDeWerd8p9Lhp8QerCIXerfLxUDfR/VuJLYqg
4xXAocjRtij77FWNs+NSa4GmPUViVFjI9INCHmnG8jh05CJbsKLmqEiPdH/jwYTj+vfCnpnARP41
x42twahnexVD97owdfCVaBOh0iST200uiHY4KaWA5eYwmJMHOH+LkIQkVGt7gFsPD1XKhInlS1u5
ph4g/xPieV0i5oNzb7mRXzUMOMkHuiFct0jV7oSkTlU//RZMeGcNbMqj0MCKh6kwL0yvuGNyoXtD
NdiACfFic7uTTzsh1Dqn8948PbNTta7if7YBlODapmd6LPXWrbPU9FFACV0Fz0XfNY3bEfq7bGKl
JYkjKFtrX7RScLVLe+5pCNLgXOdHD11ar1HnM7Dooy+qTQikDZNvHZ+SQZT3acNJ33TR1NB2nfi4
oDcLzLHweabhO06+MwRXEaUqaV55UjCf/C9XdJFq1zEoVXoY2hPNaQGkR2v8cXUOY104LGTnXhmS
Yb2BQnOXcy76ZE+J+6QOZ1QG8qA24sQOQ4qExW6yWMi2+zmaBl2+2XDlxTR+8hRWTTAdSk+XKwDy
Mns5F37iweXxSTTWq+R27ZChfpYrl2C1DnyZhegTrumKaKCuIpUvYokxwYqW7WnZlO2/ceCjoQ7f
TKVowLZCpX6pfDJqmlOC1Aw3EnqOsw+8pF8F4qYe+/EHhO7+Lh35XDyZr6xPjE1SpPRl8Y23bA4h
DyHT45Szo9H2HnJ0+cirebk9KlCJ9A0EJdKCdZF2pAcs4C/kz5F40qN7/3T2vxKvipgQ4zJhKl4I
tjbveVkW+cwoVjT3JedLzJWYF/HUyHGxwUbJFFhRQnTtEMLkiGYwVNDJ+y3dR5mPmKf9dC9LJGHl
L9ACrqO3VaYANXaHZASZgBc15IEEmANzI29uE/WSTo7+9Ix+tbG9GrG9LJ/3Q9d6IbxKSeVPIShq
w8Fv78LRnHN4v9Vxc3a5Cc7b8Bk5PXzuPseYCPEhsndvuCd5hhI73DKW7PWci4rvAyTA97SQIaFT
h4aWZbHdV1/Gwc34nGuH6F8Qq/0WXvm8TvWzGDKJeRfMznxqBS/nz56Dp5vnm526+6Pk+Yilx6gv
tHOo17YjQrVo9AcVVD8hF+ShX8+WGOSPYDu5VSNdK4mbTTJzhe1YVH35hE4r5FawS0eOaTvOzV2J
ctVlHrR5xhKTSPrigJu8HWid2gX3c7Tdw5OM2kHrpBpXd0jteDGW4hwPBTAqYtBkksZ9vsKRTPng
JtcqJ2E45DWTkKK13MyL3oFi8XY36uovPsT6uLeCiA7MaHytjxiDHk1tOYfeiC90++pfW9XuU+vX
5GRcHHH+ZCdwt3ENVec1/AFCHaYwpNY9ZJhCS0KINyU2VrZKBMvYTqqAtFmucxWfOxISaT53GCpJ
FEqNsFBh9nqV/COY5xmT15zJ5iNnvCNZ9/E21Qns/9odvKuOENWAeWd8BzHmMJF7l/Rn1EJkTJQX
aQWoqBu2i0PPjCpO8dswKNHpIYs+kH1NfMjSqjhZxnf/bWqQONSu1Hq0HwIvIImS49nk0raUVS7g
U6qic1C8DWxswPcSU3XhtBax9KN9j6mGqQlXL4tASb6hkrp00Jm4AaSgxDb+Trfn7QQvlUWNMKfA
EVdsOn0uvP17yU/7qgFwwZvCu0M3K1qX48MLT/ifWNU2KtXxv00fhgcvpn/KEchK4bVkdlS4RJYO
n6iRTvAYG4C2Rv4q9DyMRUz3+tfh0hBzgMBZUtHeHhV8tQLTo+OyCCGW8ODCnmdavWHHWWtCnNfw
ow6v6FyKqVQkc2eX4M/xYmCBYMi74Dhjl9KQJKoljN91BPsB41KD6vMBqu4xP8eN+m4MEJSLPlx5
5hciJlOHIzsR2JBILAn5LgD+17oJpYApIxsfkdRK9k7AjDbbWWcYF+rOa5qpuMMmIPhiKVbKrGOQ
2aBzTAldNQkprsRj8YEJDHhSlqnNn+6KsSW0snA9/uKsciYfE0ioAxER7fZngTX4+6AKaEkcYQF1
4HUsYYV5pQbVCzemK2NgilX5Ivqo55IgfpDXvXq12U1XH8M864uIaXyhKvItpi8RSB8DrPL8FRGB
qQwhwgax2/bhj0o8uptHegb3oDoDE7mpQYrZZCEkEklBZv5n4/6SXAEVE4bpYKJswM97wYImdd8n
eYnJUVSLu5Ys1WmETI/TlCjmePKKEEHUmOrcTa1x6hy8jwPl3eEkqeFOmIVn996TMyD4rYdxFDK8
MxB0TZ9G9zaR9Zj7FJpgdT905mapfGVd09TbtrJ6F+Smo+Ri07BpbpTgfG9UrPc3xRuJvfa+bwJF
MPlHw7wnx4jrOToTdTnO3po4DgimuHHlDicNiMxSGWE69xag0Urxhe+IvwfDZSlGF73x/MNSCgGm
6UQHS1BUWCA/5CaXa1EecTtOFWAU+QtZgbiXgsGF1cW03J+P2y9QwbnwBKhuF6iZmLyiP9kd2yz9
+E15C56kdUR90ruqav0eCbymKAcYFEl1MYahcCKtimQlZySvs+WQk7St77opjkMquX6CMT7xoEQ+
f27+JuLjA2QFr6iPsJS0DE+dE5KGlX9Cqa4kE7FeAMPJpOBI6uDmVsTnSoxIwCxk4Ldoik60GDEe
xG06qRJiQWJmo+Bz5LTW64tZPo3x7FWWiHbeTVMrmZoYy5yCo+3PXVkrvL/l4eVnE0E8GC9fD0L8
CC33YylRrB9oXDAe9ZZiWET/2hJwmiKMCAJPfsARonJaOS7OX22ZpgaMpzxaRTNeBV555tGtcrQi
j1njx8WA8SagxX5BaFbQihpSDdZXfmGoULXGhKPv0JkNECdvqHFygja+tZNJHAMxre6Q9C49/qSh
TCdyb4hGK6aLlQ3HvVtCAkjF1d35qqisV7LABEb8pH+OWiA5Vxsf58sSVhxQ3ZH/imo0qF/STc4n
2zHr+sSrIHw/qFPxQnIucCTghy/i7jkuTPI9spDk3H5R/ASee5PFs/7ERt7EtSJx+YGSuS8cq7q4
T9RFB7MBKulgbLp+cRgBpMXmoeMgT8DOkOy1z3syw2o48dTaw3mHasqVc3j5bpu+XpawxV2JORYY
8XuBi1kKsXphjPV61dl5to2/ZNlT0fJL1E2OBbId8dbFdPmSIRQw2ReIwPjB3Hr6NOhmQ3I6ao21
pINxiRffUG4oYuTFjnthdS1nNN9CsSKu8cqJNREXLKiRzc/xkxZ2C/AfInrFsN/We4r3aTCxfWgc
mbWbYC9nJt2byE2xWIe0H+6tMtD1bP8iXYWps1pt3gB23kkG7PROYcirSb166A0OjVoTAgB9Lpsd
dbggRHK0uUb3wFQ1k8cUEqIZfUws1jETj04MP/KxdsY+iq1J0xdjn9iKgr0rUA7MIuv6L+sk3XCZ
Wzw=
`

var localPrinter *message.Printer
var supportedLanguages []language.Tag

func init() {
	messagesYAMLZstd, err := base64.StdEncoding.DecodeString(messagesYAMLZstdBase64)
	if err != nil {
		panic(fmt.Errorf("Error decoding messages YAML: %v", err))
	}
	messagesYAMLReader, err := zstd.NewReader(bytes.NewReader(messagesYAMLZstd))
	if err != nil {
		panic(fmt.Errorf("Error decoding messages YAML: %v", err))
	}
	defer messagesYAMLReader.Close()
	messagesYAML, err := io.ReadAll(messagesYAMLReader)
	if err != nil {
		panic(fmt.Errorf("Error reading messages YAML: %v", err))
	}
	readTranslations(string(messagesYAML))
	SetLocalLanguage(getSystemLanguage())
}

func readTranslations(translationsYAML string) {
	var translations map[string]map[string]string

	err := yaml.Unmarshal([]byte(translationsYAML), &translations)
	if err != nil {
		panic(fmt.Errorf("Error unmarshalling translations messages: %v", err))
	}

	for langID, messages := range translations {
		tag, err := language.Parse(langID)
		if err != nil {
			continue
		}
		supportedLanguages = append(supportedLanguages, tag)
		for key, value := range messages {
			message.SetString(language.MustParse(langID), key, value)
		}
	}
}

func getSystemLanguage() language.Tag {
	lang := os.Getenv("LC_ALL")
	if lang == "" || lang == "C" || lang == "POSIX" {
		lang = os.Getenv("LC_MESSAGES")
	}
	if lang == "" || lang == "C" || lang == "POSIX" {
		lang = os.Getenv("LANG")
	}
	if lang == "" || lang == "C" || lang == "POSIX" {
		return language.English
	}
	// "zh_CN.UTF-8" -> "zh_CN"
	lang, _, _ = strings.Cut(lang, ".")
	// "fr_FR@euro" -> "fr_FR"
	lang, _, _ = strings.Cut(lang, "@")

	//  do fallback
	tag, err := language.Parse(lang)
	if err != nil {
		return language.English
	}
	return tag
}

func L(key string, args ...interface{}) string {
	return localPrinter.Sprintf(key, args...)
}

func SetLocalLanguage(lang language.Tag) {
	matcher := language.NewMatcher(supportedLanguages)
	matched, _, _ := matcher.Match(lang)
	// base, _ := matched.Base()
	// fmt.Printf("matched: %#+v base: %s\n", matched, base.String())
	localPrinter = message.NewPrinter(matched)
}
