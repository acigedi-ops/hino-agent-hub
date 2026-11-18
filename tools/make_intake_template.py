"""Generates the blank, fillable Rhino intake PDF used as the template for filled intakes.

Usage: python3 tools/make_intake_template.py public/brand/rhino-logo.png public/forms/rhino-intake-template.pdf
Requires: reportlab, pillow. Field names here must match src/lib/intake.ts.
"""
import sys
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor, white
from reportlab.lib.utils import ImageReader
from PIL import Image

LOGO, OUT = sys.argv[1], sys.argv[2]
GOLD, INK = HexColor('#F2C12C'), HexColor('#0E0D0D')
LINE, LBL, TINT = HexColor('#B9B4A6'), HexColor('#5E5A50'), HexColor('#F6F2E4')
W, H = 612, 792
M = 28
CW = W - 2 * M

c = canvas.Canvas(OUT, pagesize=(W, H))
c.setTitle('Rhino Insurance Client Intake Form')
c.setAuthor('Rhino Insurance')
form = c.acroForm


def tf(key, tip, x, y, w, h, size=9, multiline=False):
    form.textfield(name=key, tooltip=tip, x=x, y=y, width=w, height=h,
                   fontName='Helvetica', fontSize=size, borderWidth=0,
                   borderColor=None, fillColor=None, textColor=INK, forceBorder=False,
                   fieldFlags='multiline' if multiline else '')


def cb(key, tip, x, y, s=8):
    form.checkbox(name=key, tooltip=tip, x=x, y=y, size=s, buttonStyle='check',
                  borderWidth=0.6, borderColor=LBL, fillColor=white, textColor=INK, forceBorder=True)


def label(x, y, t, size=5.6, color=LBL, bold=False):
    c.setFillColor(color)
    c.setFont('Helvetica-Bold' if bold else 'Helvetica', size)
    c.drawString(x, y, t)


def box(x, y, w, h, lab):
    c.setStrokeColor(LINE); c.setLineWidth(0.5)
    c.rect(x, y, w, h, stroke=1, fill=0)
    label(x + 3, y + h - 7, lab.upper())


def row(y, h, specs):
    """specs: (label, width, key) for text, or (label, width, [(option, key), ...]) for checkboxes."""
    tot = sum(s[1] for s in specs)
    x = M
    for lab, sw, spec in specs:
        w = sw * CW / tot
        box(x, y, w, h, lab)
        if isinstance(spec, list):
            cx = x + 4
            for opt, key in spec:
                cb(key, f'{lab}: {opt}', cx, y + 2.5)
                label(cx + 10.5, y + 4, opt, 7.5, INK)
                cx += 10.5 + c.stringWidth(opt, 'Helvetica', 7.5) + 9
        else:
            tf(spec, lab, x + 2, y + 1, w - 4, h - 9)
        x += w


def section(x, y, w, title, note=None):
    c.setFillColor(TINT); c.rect(x, y, w, 13, stroke=0, fill=1)
    c.setFillColor(GOLD); c.rect(x, y, 4, 13, stroke=0, fill=1)
    label(x + 10, y + 3.8, title.upper(), 8, INK, True)
    if note:
        tw = c.stringWidth(title.upper(), 'Helvetica-Bold', 8)
        label(x + 10 + tw + 8, y + 4, note, 6.8, LBL)


def table(x, y_top, width, cols, rows, prefix, rh=19, numbered=True):
    """cols: (header, width, key) or (header, width, [(option, key), ...]). Field name = f'{prefix}{row}_{key}'."""
    tot = sum(col[1] for col in cols)
    num_w = 14 if numbered else 0
    scale = (width - num_w) / tot
    hh = 12
    c.setFillColor(INK); c.rect(x, y_top - hh, width, hh, stroke=0, fill=1)
    cx = x + num_w
    for hname, cw, _ in cols:
        label(cx + 3, y_top - hh + 3.6, hname.upper(), 5.8, GOLD, True)
        cx += cw * scale
    y = y_top - hh
    for r in range(1, rows + 1):
        y -= rh
        c.setStrokeColor(LINE); c.setLineWidth(0.5)
        c.rect(x, y, width, rh, stroke=1, fill=0)
        if numbered:
            c.setFillColor(TINT); c.rect(x + 0.3, y + 0.3, num_w - 0.3, rh - 0.6, stroke=0, fill=1)
            c.setFillColor(INK); c.setFont('Helvetica-Bold', 7.5)
            c.drawCentredString(x + num_w / 2, y + rh / 2 - 2.6, str(r))
        cx = x + num_w
        for hname, cw, spec in cols:
            w = cw * scale
            c.line(cx, y, cx, y + rh)
            if isinstance(spec, list):
                ox = cx + 4
                for opt, key in spec:
                    cb(f'{prefix}{r}_{key}', f'{hname} {opt}', ox, y + rh / 2 - 4)
                    label(ox + 10.5, y + rh / 2 - 2.6, opt, 7, INK)
                    ox += 10.5 + c.stringWidth(opt, 'Helvetica', 7) + 6
            else:
                tf(f'{prefix}{r}_{spec}', hname, cx + 2, y + 1.5, w - 4, rh - 3, 8.5)
            cx += w
    return y


# header band
BH = 62
c.setFillColor(INK); c.rect(0, H - BH, W, BH, stroke=0, fill=1)
c.setFillColor(GOLD); c.rect(0, H - BH - 3, W, 3, stroke=0, fill=1)
logo = Image.open(LOGO).convert('RGB').crop((165, 190, 928, 867))
lh = 50; lw = lh * logo.width / logo.height
c.drawImage(ImageReader(logo), M, H - BH + 6, lw, lh)
c.setFillColor(GOLD); c.setFont('Helvetica-Bold', 19)
c.drawRightString(W - M, H - 30, 'CLIENT INTAKE FORM')
c.setFillColor(white); c.setFont('Helvetica', 9.5)
c.drawRightString(W - M, H - 45, 'Personal and Commercial Auto')

RH, GAP = 25, 7
y = H - BH - 3 - 9

y -= RH
row(y, RH, [('Date', 70, 'date'), ('Agent', 130, 'agent'),
            ('Priority', 110, [('High', 'priority_high'), ('Normal', 'priority_normal'), ('Low', 'priority_low')]),
            ('Lead source', 106, 'lead_source'),
            ('Quote type', 140, [('Personal', 'type_personal'), ('Commercial', 'type_commercial')])])

y -= GAP + 13; section(M, y, CW, 'Applicant')
y -= RH; row(y, RH, [('Full name', 230, 'full_name'), ('Date of birth', 90, 'dob'),
                     ("Driver's license #", 166, 'dl_number'), ('DL state', 70, 'dl_state')])
y -= RH; row(y, RH, [('Spouse / domestic partner', 230, 'spouse_name'), ('Date of birth', 90, 'spouse_dob'),
                     ("Driver's license #", 166, 'spouse_dl_number'), ('DL state', 70, 'spouse_dl_state')])
y -= RH; row(y, RH, [('Phone 1', 120, 'phone1'), ('Phone 2', 120, 'phone2'), ('Email', 316, 'email')])
y -= RH; row(y, RH, [('Address 1', 278, 'address1'), ('Address 2', 278, 'address2')])

y -= GAP + 13; section(M, y, CW, 'Household and current insurance')
y -= RH; row(y, RH, [('Housing', 136, [('Rent', 'housing_rent'), ('Own', 'housing_own'), ('Share', 'housing_share')]),
                     ('Family / children', 100, 'family_children'), ('Country / city of origin', 140, 'origin'),
                     ('Time in US (yrs / mo)', 90, 'time_in_us'), ('Grade / score', 90, 'grade_score')])
y -= RH; row(y, RH, [('Insured in last 30 days', 100, [('Yes', 'insured30_yes'), ('No', 'insured30_no')]),
                     ('Current carrier', 150, 'current_carrier'), ('Expiration date', 86, 'expiration_date'),
                     ('How long insured', 86, 'how_long_insured'),
                     ('Payment preference', 134, [('EFT', 'pay_eft'), ('Card', 'pay_card')])])

y -= GAP + 13; section(M, y, CW, 'Commercial / trucking', 'Complete for commercial quotes only')
y -= RH; row(y, RH, [('Business name', 180, 'business_name'), ('Experience (yrs)', 66, 'experience_years'),
                     ('DOT #', 76, 'dot'), ('MC #', 76, 'mc'), ('EIN', 80, 'ein'), ('UBI', 78, 'ubi')])
y -= RH; row(y, RH, [('Current truck insurance: carrier / agent / state', 236, 'truck_insurance'),
                     ('Expire / renewal date', 100, 'truck_renewal_date'), ('How long', 80, 'truck_how_long'),
                     ('Cargo limit', 140, [('100k', 'cargo_100k'), ('250k', 'cargo_250k'), ('Other', 'cargo_other')])])
y -= RH; row(y, RH, [('Trailer type', 196, [('Reefer', 'trailer_reefer'), ('Dry van', 'trailer_dry_van'),
                                            ('Flatbed', 'trailer_flatbed'), ('Other', 'trailer_other')]),
                     ('Length', 104, [("45'", 'len_45'), ("48'", 'len_48'), ("53'", 'len_53')]),
                     ('Radius', 150, [('Local', 'radius_local'), ('Long (500+ mi)', 'radius_long')]),
                     ('IFTA', 76, [('Yes', 'ifta_yes'), ('No', 'ifta_no')])])
y -= RH; row(y, RH, [('ELD provider', 180, 'eld_provider'),
                     ('Trailers / equipment (car hauler, step deck, lowboy, gooseneck, roll off, intermodal)', 376,
                      'trailer_equipment')])

y -= GAP + 13; section(M, y, CW, 'Drivers')
y = table(M, y - 2, CW, [('Full name', 108, 'name'), ('Date of birth', 52, 'dob'), ('License #', 76, 'dl'),
                         ('Yrs lic.', 30, 'years_licensed'), ('Marital', 42, 'marital'),
                         ('Occupation', 70, 'occupation'), ('Education', 56, 'education'),
                         ('DDC / GS', 66, [('DDC', 'ddc'), ('GS', 'gs')]), ('Relationship', 56, 'relationship')],
          4, 'd')

y -= GAP + 13; section(M, y, CW, 'Vehicles')
y = table(M, y - 2, CW, [('Year', 34, 'year'), ('Make', 70, 'make'), ('Model', 78, 'model'), ('VIN', 132, 'vin'),
                         ('Annual miles', 52, 'annual_miles'), ('Assigned driver', 76, 'driver'),
                         ('Ownership', 62, 'ownership'),
                         ('Liability only', 62, [('Yes', 'liab_yes'), ('No', 'liab_no')])], 4, 'v')

y -= GAP + 13
half = (CW - 10) / 2
section(M, y, half, 'Violations and accidents', 'Last 3 years')
section(M + half + 10, y, half, 'Notes and comments')
top = y - 2
yb = table(M, top, half, [('Driver', 96, 'driver'), ('Date', 60, 'date'), ('Type', 110, 'type')], 4, 'x',
           numbered=False)
c.setStrokeColor(LINE); c.setLineWidth(0.5)
c.rect(M + half + 10, yb, half, top - yb, stroke=1, fill=0)
tf('notes', 'Notes and comments', M + half + 12, yb + 2, half - 4, top - yb - 4, 8.5, multiline=True)

c.setStrokeColor(GOLD); c.setLineWidth(1); c.line(M, 30, W - M, 30)
label(M, 20, 'Rhino Insurance  |  Confidential client information. For agency use only.', 6.8, LBL)
c.setFont('Helvetica', 6.8); c.setFillColor(LBL)
c.drawRightString(W - M, 20, 'DDC: defensive driving course   GS: good student   Ownership: lease, finance or own')
c.showPage(); c.save()
