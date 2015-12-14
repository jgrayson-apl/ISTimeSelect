define([
  "dojo/_base/declare",
  "dojo/_base/lang",
  "dojo/_base/array",
  "dojo/on",
  "dojo/query",
  "dojo/dom-class",
  "dojo/date/locale",
  "dojo/Deferred",
  "jimu/BaseWidget",
  'dijit/_WidgetsInTemplateMixin',
  "dojo/dnd/Moveable",
  "dijit/ConfirmDialog",
  "put-selector/put",
  "dojo/store/Memory",
  "esri/layers/ArcGISImageServiceLayer",
  "esri/layers/MosaicRule",
  "esri/tasks/query",
  "esri/tasks/QueryTask",
  "esri/geometry/mathUtils",
  "dijit/Toolbar",
  "dijit/form/Button",
  "dijit/form/Select"
], function (declare, lang, array, on, query, domClass, locale, Deferred,
             BaseWidget, _WidgetsInTemplateMixin, Moveable, ConfirmDialog, put, Memory,
             ArcGISImageServiceLayer, MosaicRule, Query, QueryTask, mathUtils) {

  /**
   * ISTimeSelect
   *  - This WAB widget allows for temporal filtering of an Image Service
   */
  return declare([BaseWidget, _WidgetsInTemplateMixin], {

    // BASE CLASS //
    baseClass: "ISTimeSelect",

    // PAN/ZOOM FACTORS //
    mapZoomFactor: 2.0,
    mapWidthPanFactor: 0.75,
    extentShrinkFactor: 0.9,

    // IS CURRENT DATE FIRST/LAST //
    isOldest: true,
    isNewest: true,

    /**
     *
     */
    postCreate: function () {
      this.inherited(arguments);

      // MAKE MOVABLE //
      new Moveable(this.containerNode, {handle: this.titleNode});

      // IMAGERY DATE SELECT //
      this.imageryDateSelect.set("store", new Memory({data: []}));

    },

    /**
     *
     */
    startup: function () {
      this.inherited(arguments);

      // VALIDATE CONFIG //
      this.hasValidConfig = this._validateConfig();
      if(this.hasValidConfig) {
        // ADD IMAGE SERVICE LAYER //
        this._addImageServiceLayer();
      } else {
        alert("Invalid widget config!");
      }
    },

    /**
     * VALIDATE CONFIG
     *  - MOSAIC METHOD AND MINIMUM ZOOM LEVEL ARE SET HERE IF NOT IN CONFIG.
     *  - WE NEED A TITLE, AN ITEM, AND A DATE FIELD.
     */
    _validateConfig: function () {

      // MOSAIC METHOD //
      this.mosaicMethod = this.config.mosaicMethod || MosaicRule.METHOD_LOCKRASTER;
      // MIN ZOOM LEVEL //
      this.minZoomLevel = this.config.minZoomLevel || 8;

      // TITLE //
      var hasTitle = this.config.hasOwnProperty("title") && (this.config.title != null) && (this.config.title.length > 0);
      // ITEM INFO //
      var hasItemInfo = this.config.hasOwnProperty("itemInfo") && (this.config.itemInfo != null);
      // DATE FIELD //
      var hasDateField = this.config.hasOwnProperty("dateField") && (this.config.dateField != null && this.config.dateField.length > 0);

      // VALIDATE //
      return hasTitle && hasItemInfo && hasDateField;
    },

    /**
     *
     * @private
     */
    _addImageServiceLayer: function () {

      // VALID CONFIG //
      if(this.hasValidConfig) {

        // IMAGE SERVICE LAYER //
        this.ISLayer = new ArcGISImageServiceLayer(this.config.itemInfo.url, {id: this.config.itemInfo.id, visible: true});
        // IMAGE SERVICE LAYER LOADED //
        this.ISLayer.on("load", lang.hitch(this, function () {
          // DEFAULT MOSAIC RULE //
          this.defaultMosaicRule = this.ISLayer.defaultMosaicRule || lang.clone(this.ISLayer.mosaicRule);
          // SET MAP WAIT CURSOR WHILE UPDATING LAYER //
          this.ISLayer.on("update-start", lang.hitch(this.map, this.map.setMapCursor, "wait"));
          this.ISLayer.on("update-end", lang.hitch(this.map, this.map.setMapCursor, "default"));
          // ADD IMAGE SERVICE LAYER //
          this.map.addLayer(this.ISLayer);
          // MAP EXTENT CHANGE //
          this.map.on("extent-change", lang.hitch(this, this._mapExtentChange));
        }));

      }
    },

    /**
     *  WIDGET IS OPENED
     */
    onOpen: function () {
      this.inherited(arguments);

      // INITIAL PREVIOUS INFO //
      this.previousInfo = {
        hasImagery: false,
        extent: this.map.extent,
        level: this.map.getLevel()
      };
      this.previousLevel = this.previousInfo.level;

      // UPDATE DATE CONTROLS //
      this.updateDateControls();

      // GET IMAGERY DATES //
      this.getImageryDates();

    },

    /**
     * WIDGET IS CLOSED
     */
    onClose: function () {
      this.inherited(arguments);

      // UPDATE DATE CONTROLS //
      this.updateDateControls();
    },

    /**
     * UPDATE DATE CONTROLS BASED ON CURRENT ZOOM LEVEL, IMAGERY AVAILABILITY WITHIN CURRENT EXTENT, AND IMAGE INDEX
     *
     * @private
     */
    updateDateControls: function () {

      // VALID ZOOM LEVEL //
      var validZoomLevel = (this.map.getLevel() >= this.minZoomLevel);
      // IMAGERY AVAILABILITY //
      var hasImagery = this.previousInfo.hasImagery;

      // ENABLE PREV/NEXT BUTTONS //
      this.prevBtn.set("disabled", !hasImagery || !validZoomLevel || this.isOldest);
      this.nextBtn.set("disabled", !hasImagery || !validZoomLevel || this.isNewest);

      // ENABLE DATE SELECT //
      this.imageryDateSelect.set("disabled", !hasImagery || !validZoomLevel);
      if(this.imageryDateSelect.get("disabled")) {
        this.setDisplayMessage((!validZoomLevel) ? this.nls.zoomInToSelectDate : this.nls.noImageryAvailable);
        // USE DEFAULT MOSAIC RULE //
        if(this.ISLayer && this.defaultMosaicRule) {
          this.ISLayer.setMosaicRule(this.defaultMosaicRule);
        }
      }
    },

    /**
     *
     * @param message
     */
    setDisplayMessage: function (message) {
      this.imageryDateSelect._setDisplay(message || "");
    },

    /**
     * MAP EXTENT CHANGE EVENT
     *
     * @param evt
     * @private
     */
    _mapExtentChange: function (evt) {
      //console.info("_mapExtentChange: ", evt.lod.level, evt.levelChange);

      // VALID ZOOM LEVEL //
      var validZoomLevel = (evt.lod.level >= this.minZoomLevel);
      if(validZoomLevel) {
        // HAS THE MAP EXTENT CHANGED SUFFICIENT TO UPDATE THE DATES? //
        var needsUpdate = false;

        // NEEDS UPDATE BASED ON LEVEL CHANGE? //
        if(evt.levelChange) {
          var zoomLevelChange = Math.abs(evt.lod.level - this.previousInfo.level);
          if(zoomLevelChange >= this.mapZoomFactor) {
            console.info("LARGE zoom: ", evt);
            needsUpdate = true;
          } else {
            // NOT A BIG CHANGE BUT WE'VE CROSSED THE MIN ZOOM LEVEL THRESHOLD //
            if(this.previousLevel < this.minZoomLevel) {
              console.info("THRESHOLD zoom: ", evt);
              needsUpdate = true;
            }
          }
        } else {
          // NEEDS UPDATE BASED ON PAN CHANGE? //
          var panDistance = Math.abs(mathUtils.getLength(evt.extent.getCenter(), this.previousInfo.extent.getCenter()));
          var previousMapWidth = (this.previousInfo.extent.getWidth() * this.mapWidthPanFactor);
          if(panDistance > previousMapWidth) {
            console.info("LARGE pan: ", evt);
            needsUpdate = true;
          }
        }

        // NEEDS UPDATE //
        if(needsUpdate) {
          this.getImageryDates();
        }
      } else {
        this.updateDateControls();
      }

      // PREVIOUS LEVEL //
      this.previousLevel = evt.lod.level;
    },

    /**
     * USER CLICK ON PREVIOUS BUTTON
     *
     * @private
     */
    _onPreviousDate: function () {
      this._selectionOffset(1);
    },

    /**
     *  USER CLICK ON NEXT BUTTON
     *
     * @private
     */
    _onNextDate: function () {
      this._selectionOffset(-1);
    },

    /**
     * SELECTION OFFSET
     *  - USED BY PREV/NEXT BUTTONS
     *
     * @param offset
     * @private
     */
    _selectionOffset: function (offset) {
      var currentDateText = this.imageryDateSelect.get("value");
      var dateStore = this.imageryDateSelect.get("store");
      var selectionItem = dateStore.data[dateStore.index[+currentDateText] + offset];
      if(selectionItem) {
        this.imageryDateSelect.set("value", selectionItem.id);
      } else {
        console.info("Could not find item: ", currentDateText, selectionItem);
      }
    },

    /**
     * NEW DATE SELECTED IN DATE SELECT LIST
     *
     * @param selectedDateText
     * @private
     */
    _onDateChange: function (selectedDateText) {
      var deferred = new Deferred();

      console.info("_onDateChange: ", selectedDateText);

      if(this.hasValidConfig) {
        // GET SELECTED ITEM //
        var imageryDatesStore = this.imageryDateSelect.get("store");
        var selectedItem = imageryDatesStore.get(selectedDateText);
        if(selectedItem) {

          //       - http://resources.arcgis.com/en/help/arcgis-rest-api/index.html#/Mosaic_rule_objects/02r3000000s4000000/
          //
          //         ByAttribute: Orders rasters based on the absolute distance between their values of an attribute and a base value. Only numeric or date fields are applicable. Mosaic results are view-independent.
          //
          //            {
          //              "mosaicMethod" : "esriMosaicAttribute", //required
          //              "sortField" : "<sortFieldName>",//required, numeric or date fields only.
          //              "sortValue" : <sortValue>,//optional, default is null or 0. Use numeric values for numeric fields and use the following string format for date field:
          //                            yyyy/MM/dd HH:mm:ss.s
          //                            yyyy/MM/dd HH:mm:ss
          //                            yyyy/MM/dd HH:mm
          //                            yyyy/MM/dd HH
          //                            yyyy/MM/dd
          //                            yyyy/MM
          //                            yyyy
          //
          //                "ascending" : <true | false>,//optional, default is true
          //                "where" : "<where>", //optional
          //                "fids" : [<fid1>, <fid2>],//optional
          //                "mosaicOperation" : "<MT_FIRST | MT_BLEND | MT_SUM>" //default is MT_FIRST
          //              }
          //
          //          LockRaster: Displays only the selected rasters. Mosaic results are view-independent.
          //
          //            {
          //              "mosaicMethod" : "esriMosaicLockRaster", //required
          //              "lockRasterIds" : [<rasterId1>, <rasterId2>],  //required
          //              "where" : "<where>", //optional
          //              "ascending" : <true | false>,//optional, default is true
          //              "fids" : [<fid1>, <fid2>],//optional
          //              "mosaicOperation" : "<MT_FIRST | MT_LAST | MT_MIN | MT_MAX | MT_MEAN | MT_BLEND | MT_SUM>" //default is MT_FIRST
          //            }
          //
          //       - http://desktop.arcgis.com/en/desktop/latest/manage-data/raster-and-images/understanding-the-mosaicking-rules-for-a-mosaic-dataset.htm


          // NEW MOSAIC RULE //
          var newMosaicRule = new MosaicRule();
          newMosaicRule.ascending = true;
          newMosaicRule.operation = MosaicRule.OPERATION_FIRST;
          newMosaicRule.method = this.mosaicMethod;

          // MOSAIC METHOD //
          if(newMosaicRule.method === MosaicRule.METHOD_LOCKRASTER) {
            newMosaicRule.lockRasterIds = selectedItem.lockRasterIds;
          } else {
            newMosaicRule.sortField = this.config.dateField;
            newMosaicRule.sortValue = selectedItem.queryDate;
          }

          // SET MOSAIC RULE //
          this.ISLayer.setMosaicRule(newMosaicRule);

          // SELECTION INDEX //
          var selectionIndex = imageryDatesStore.index[selectedItem.id];
          this.isOldest = (selectionIndex === (imageryDatesStore.data.length - 1));
          this.isNewest = (selectionIndex === 0);

          // UPDATE DATE CONTROLS //
          this.updateDateControls();

          deferred.resolve();
        } else {
          deferred.reject();
        }
      } else {
        deferred.reject();
      }

      return deferred.promise;
    },

    /**
     * RETRIEVE DATES OF IMAGERY IN CURRENT MAP EXTENT
     *
     * @private
     */
    getImageryDates: function () {
      var deferred = new Deferred();

      if(this.hasValidConfig) {

        // CANCEL PREVIOUS REQUESTS //
        if(this.getImageDatesHandle && !this.getImageDatesHandle.isFulfilled()) {
          this.getImageDatesHandle.cancel();
        }

        // GET CURRENT DATE //
        var currentValue = this.imageryDateSelect.get("value");
        // DISPLAY MESSAGE //
        this.setDisplayMessage(this.nls.findingImageryDates);

        // DATE QUERY //
        var dateQuery = new Query();
        dateQuery.where = "Category = 1";
        dateQuery.geometry = this.map.extent.expand(this.extentShrinkFactor);
        dateQuery.returnGeometry = false;
        dateQuery.outFields = [this.config.dateField];
        dateQuery.orderByFields = [this.config.dateField + " DESC"];

        // QUERY TASK //
        var queryTask = new QueryTask(this.ISLayer.url);
        this.getImageDatesHandle = queryTask.execute(dateQuery).then(lang.hitch(this, function (featureSet) {
          //console.info("getImageryDates: ", featureSet);

          // DO WE HAVE IMAGERY IN THIS EXTENT? //
          var hasImagery = (featureSet.features.length > 0);

          // PREVIOUS INFO //
          this.previousInfo = {
            hasImagery: hasImagery,
            extent: this.map.extent,
            level: this.map.getLevel()
          };

          // IMAGERY DATES STORE //
          var imageryDatesStore = new Memory({data: []});

          // CREATE UNIQUE LIST OF DATES WITH MATCHING LOCKRASTERIDS //
          array.forEach(featureSet.features, lang.hitch(this, function (feature) {
            // IMAGE ID //
            var imageId = feature.attributes[this.ISLayer.objectIdField];
            // IMAGE DATE //
            var dateValue = feature.attributes[this.config.dateField];

            // GET STORE ENTRY FOR THIS DATE //
            var imageInfo = imageryDatesStore.get(dateValue);
            if(!imageInfo) {
              // IMAGE DATE //
              var dateObj = new Date(dateValue);

              // FORMAT DATE //
              // TODO: MAKE THESE FORMATS CONFIGURABLE
              var queryDate = locale.format(dateObj, {selector: "date", datePattern: "yyyy/MM/dd"});
              var displayDate = locale.format(dateObj, {selector: "date", datePattern: "EEE dd MMM yyyy"});

              // ADD DATE INFO //
              imageryDatesStore.add({
                id: dateValue + "",  //  - MAKE SURE IT'S A STRING SO dijit/form/Select IS OK WITH THIS DATE VALUE AS ID //
                dateValue: dateValue,
                displayDate: displayDate,
                queryDate: queryDate,
                lockRasterIds: [imageId]
              });
            } else {
              // UPDATE DATE INFO lockRasterIds //
              imageInfo.lockRasterIds.push(imageId);
              imageryDatesStore.put(imageInfo);
            }
          }));

          // SET STORE FOR DATE SELECT //
          this.imageryDateSelect.set("store", imageryDatesStore);

          // SET CURRENT TO PREVIOUS IF PREVIOUS DATE STILL EXISTS IN NEW LIST OF DATES //
          if(currentValue && (imageryDatesStore.get(currentValue) != null)) {
            this.imageryDateSelect.set("value", currentValue);
            this._onDateChange(currentValue);
          } else {
            if(hasImagery) {
              var newCurrentValue = imageryDatesStore.data[0].id;
              this.imageryDateSelect.set("value", newCurrentValue);
              this._onDateChange(newCurrentValue);
            } else {
              this.updateDateControls();
            }
          }
          deferred.resolve();
        }));
      } else {
        deferred.reject();
      }

      return deferred.promise;
    },

    /**
     * USER CLICKS ABOUT BUTTON
     *
     * @private
     */
    _onAboutClick: function () {

      // ABOUT DIALOG CONTENT //
      var aboutContentNode = put("div.about-content");
      put(aboutContentNode, "div", {innerHTML: this.nls.aboutContent});
      if(this.config.itemInfo) {
        put(aboutContentNode, "div a", {
          innerHTML: this.config.itemInfo.title,
          href: this.config.itemInfo.detailsPageUrl,
          target: "_blank"
        });
      }
      put(aboutContentNode, "div div", lang.replace("Version: {version}", this));

      // ABOUT DIALOG //
      var aboutDialog = new ConfirmDialog({
        title: this.nls.aboutLabel,
        content: aboutContentNode
      });
      domClass.add(aboutDialog.domNode, lang.replace("{baseClass}-dlg", this));
      aboutDialog.show();

    }

  });
});