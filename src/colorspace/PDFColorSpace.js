goog.provide("trapeze.colorspace.PDFColorSpace");
goog.require("trapeze.colorspace.PatternSpace");
goog.require("trapeze.colorspace.IndexedColor");
goog.require("trapeze.colorspace.ICC_ColorSpace");
goog.require("trapeze.colorspace.AlternateColorSpace");
goog.require("trapeze.pdffunction.PDFFunction");
goog.require("trapeze.StreamBuffer");
goog.require("trapeze.cos.COSName")
trapeze.colorspace.PDFColorSpace = function(cs) {
	this._cs = cs;
}
/**
 * For now we'll just return the color in RGB
 * Java PDF does a full implementation of this
 * @return array of RGB
 */
trapeze.colorspace.PDFColorSpace.prototype.getPaint = function(components) {
	var rgb = this._cs.toRGB(components);
	return rgb;
}
/**
 * Get the number of components expected in the getPaint command
 * @return int
 */
trapeze.colorspace.PDFColorSpace.prototype.getNumComponents = function() {
	return this._cs.getNumComponents();
}
/**
 * @return string
 */
trapeze.colorspace.PDFColorSpace.prototype.toString = function() {
	var name = 'PDFColorSpace';
	if(this._cs.toString)
		name += '{' + this._cs.toString() + '}';
	return name;
}
trapeze.colorspace.PDFColorSpace.prototype.toRGB = function(components) {
	return this._cs.toRGB(components);
}
trapeze.colorspace.PDFColorSpace.getColorSpaceByName = function(name) {
	if(!trapeze.colorspace.PDFColorSpace.staticColorSpacesInitialized) {
		trapeze.colorspace.PDFColorSpace.patternSpace = new trapeze.colorspace.PatternSpace();
		// TODO graySpace
		// TODO move these to a class of their own
		trapeze.colorspace.PDFColorSpace.rgbSpace = new trapeze.colorspace.PDFColorSpace({
			toRGB: function(components) {
				return this.getPaint(components);
			},
			getNumComponents: function() {
				return 3;
			},
			// for now we just return rgb value
			/**
			 * @param array components should be 3 floats 0 to 1
			 */
			getPaint: function(components) {
				var r = Math.round( components[0] * 255 );
				var g = Math.round( components[1] * 255 );
				var b = Math.round( components[2] * 255 );
				return [r, g, b];
			},
			toString: function() {
				return "PDFColorSpace.rgbSpace";
			}
		});

		trapeze.colorspace.PDFColorSpace.cmykSpace = new trapeze.colorspace.PDFColorSpace({
			toRGB: function(components) {
				return this.getPaint(components);
			},
			getNumComponents: function() {
				return 4;
			},
			/**
			 * @param array components should be 4 floats 0 to 1
			 */
			getPaint: function(components) {
				return trapeze.colorspace.PDFColorSpace.CMYKtoRGB(components[0], components[1], components[2], components[3]);
			},
			toString: function() {
				return "PDFColorSpace.cmykSpace";
			}
		});
	}
	switch (name) {
        case trapeze.colorspace.PDFColorSpace.COLORSPACE_GRAY:
            return trapeze.colorspace.PDFColorSpace.graySpace;

        case trapeze.colorspace.PDFColorSpace.COLORSPACE_RGB:
            return trapeze.colorspace.PDFColorSpace.rgbSpace;

        case trapeze.colorspace.PDFColorSpace.COLORSPACE_CMYK:
            return trapeze.colorspace.PDFColorSpace.cmykSpace;

        case trapeze.colorspace.PDFColorSpace.COLORSPACE_PATTERN:
            return trapeze.colorspace.PDFColorSpace.patternSpace;

		default:
            throw new IllegalArgumentException("Unknown Color Space name: " +
                name);
	}
}
trapeze.colorspace.PDFColorSpace.staticColorSpacesInitialized = false;
trapeze.colorspace.PDFColorSpace.getColorSpace = function(csobj, resources) {
	var name;
	if(csobj instanceof trapeze.cos.COSName) {
		name = csobj.name;
		var colorSpaces;
		
		if (resources != null) {
            colorSpaces = resources.resources.getDictionaryObject("ColorSpace");
        }
		
		if (name == "DeviceGray" || name == "G") {
			return trapeze.colorspace.PDFColorSpace.getColorSpaceByName(trapeze.colorspace.PDFColorSpace.COLORSPACE_GRAY);
		} else if (name == "DeviceRGB" || name == "RGB") {
			return trapeze.colorspace.PDFColorSpace.getColorSpaceByName(trapeze.colorspace.PDFColorSpace.COLORSPACE_RGB);
		} else if (name == "DeviceCMYK" || name == "CMYK") {
			return trapeze.colorspace.PDFColorSpace.getColorSpaceByName(trapeze.colorspace.PDFColorSpace.COLORSPACE_CMYK);
		} else if (name == "Pattern") {
			return trapeze.colorspace.PDFColorSpace.getColorSpaceByName(trapeze.colorspace.PDFColorSpace.COLORSPACE_PATTERN);
		} else if (colorSpaces != null) {
			csobj = colorSpaces.getDictionaryObject(name);
		}
	}
	
	var value = null;

	// csobj is [/name <<dict>>]
	var ary = csobj;
	name = csobj.getObject(0).name;

	if (name == "CalGray") {
		value = new trapeze.colorspace.PDFColorSpace(new CalGrayColor(ary.getObject(1)));
	} else if (name == "CalRGB") {
		value = new trapeze.colorspace.PDFColorSpace(new CalRGBColor(ary.getObject(1)));
	} else if (name == "Lab") {
		value = new trapeze.colorspace.PDFColorSpace(new LabColor(ary.getObject(1)));
	} else if (name == "ICCBased") {
		var streamContents = ary.getObject(1).decode();
		var stream = new trapeze.StreamBuffer(streamContents);
		//var profile = ICC_Profile.getInstance(bais);
		value = new trapeze.colorspace.PDFColorSpace(new trapeze.colorspace.ICC_ColorSpace(stream));
	} else if (name == "Separation" || name == "DeviceN") {
		console.warn("Colorspace seperation and DevinceN are not implemented fullly");
		var alternate = trapeze.colorspace.PDFColorSpace.getColorSpace(ary.getObject(2), resources);
		var func = trapeze.pdffunction.PDFFunction.getFunction(ary.getObject(3));

		value = new trapeze.colorspace.AlternateColorSpace(alternate, func);
	} else if (name == "Indexed" || name == "I") {
		/**
		 * 4.5.5 [/Indexed baseColor hival lookup]
		 */
		var refspace = trapeze.colorspace.PDFColorSpace.getColorSpace(ary.getObject(1), resources);

		// number of indices= ary[2], data is in ary[3];
		var count = ary.getObject(2).value;
		value = new trapeze.colorspace.IndexedColor(refspace, count, ary.getObject(3));
	} else if (name == "Pattern") {
		console.warn("Colorspace Pattern is not implemented fullly");
		if (ary.size() == 1) {
			return trapeze.colorspace.PDFColorSpace.getColorSpaceByName(trapeze.colorspace.PDFColorSpace.COLORSPACE_PATTERN);
		}

		var base = getColorSpace(ary.getObject(1), resources);

		return new trapeze.colorspace.PatternSpace(base);
	} else {
		throw new PDFParseException("Unknown color space: " + name +
			" with " + ary[1]);
	}

	//csobj.setCache(value);

	return value;
	throw new UnimplementedException("Only support names color spaces");
}
/** the name of the device-dependent gray color space */
trapeze.colorspace.PDFColorSpace.COLORSPACE_GRAY = 0;

/** the name of the device-dependent RGB color space */
trapeze.colorspace.PDFColorSpace.COLORSPACE_RGB = 1;

/** the name of the device-dependent CMYK color space */
trapeze.colorspace.PDFColorSpace.COLORSPACE_CMYK = 2;

/** the name of the pattern color space */
trapeze.colorspace.PDFColorSpace.COLORSPACE_PATTERN = 3;
/**
 * @param c,m,y,k float 0 to 1
 * @return array of [R,G,B] 0 to 255
 */
trapeze.colorspace.PDFColorSpace.CMYKtoRGB = function(c, m, y, k) {
	var r = 1 - Math.min( 1, c * ( 1 - k ) + k );
	var g = 1 - Math.min( 1, m * ( 1 - k ) + k );
	var b = 1 - Math.min( 1, y * ( 1 - k ) + k );

	r = Math.round( r * 255 );
	g = Math.round( g * 255 );
	b = Math.round( b * 255 );
	return [r, g, b];
}
