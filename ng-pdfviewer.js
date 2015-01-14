/**
 * @preserve AngularJS PDF viewer directive using pdf.js.
 *
 * https://github.com/akrennmair/ng-pdfviewer 
 *
 * MIT license
 */

angular.module('ngPDFViewer', []).
directive('pdfviewer', [ '$log', '$q', '$compile', function($log, $q, $compile) {
	var canvases = [];
	var instance_id = null;

	return {
		restrict: "E",
		template:
			'<div class="scroll-window"></div>' +
            '<div class="control-popover"></div>',
		scope: {
			onPageLoad: '&',
			loadProgress: '&',
			src: '@',
			id: '=',
			pdfUri: '=pdfUri',
			pagesToShow: '@',
			scale: '@',
			downloadFilename: '=',
			scaleBy: '@'
		},
		controller: ["$scope", "$element", "$attrs", function ($scope, $element, $attrs) {
			$scope.pageNum = 1;
			$scope.pdfDoc = null;
			$scope.renderInProgress = false;
			$scope.forceReRender = true;

			$scope.documentProgress = function(progressData) {
				if ($scope.loadProgress) {
					$scope.loadProgress({state: "loading", loaded: progressData.loaded, total: progressData.total});
				}
			};
			$scope.setScale = function (newValue) {
                $scope.scale = newValue;
                $scope.forceReRender = true;
			};
			$scope.setScaleAndRender = function(scale) {
				console.log("set scale and render");
				$scope.setScale(scale);
				$scope.renderDocument();
			};
			$scope.incScale = function () {
				console.log("inc scale");
				$scope.setScale($scope.currentScale * 1.1);
				$scope.renderDocument();
			};
			$scope.decScale = function () {
				console.log("dec scale");
				$scope.setScale($scope.currentScale * 0.9);
				$scope.renderDocument();
			};
			$scope.fitByWidth = function () {
				console.log("fit viewport by width");
				$scope.setScale('fitWidth');
				$scope.renderDocument();
			};
			$scope.b64toBlob = function (b64Data, contentType, sliceSize) {
				contentType = contentType || '';
				sliceSize = sliceSize || 512;

				var byteCharacters = atob(b64Data);
				var byteArrays = [];

				for (var offset = 0; offset < byteCharacters.length; offset += sliceSize) {
					var slice = byteCharacters.slice(offset, offset + sliceSize);

					var byteNumbers = new Array(slice.length);
					for (var i = 0; i < slice.length; i++) {
						byteNumbers[i] = slice.charCodeAt(i);
					}

					/* Unit8Array is not available in safari yet */
					var byteArray = new Uint8Array(byteNumbers);

					byteArrays.push(byteArray);
				}

				/* somehow the chuncked way of constructing the blob does not work in safari
				* old code construct new Blob(byteArrays) does not work in safari.
				* new code concats the arrays first.
				* */
				console.log([].concat(byteArrays));
				var blob = new Blob(byteArrays, {type: contentType});
				return blob;
			};
			var BASE64_MARKER = ';base64,';
			$scope.convertDataURIToBinary = function (dataURI) {
				var base64Index = dataURI.indexOf(BASE64_MARKER) + BASE64_MARKER.length;
				var base64 = dataURI.substring(base64Index);
				var raw = window.atob(base64);
				var rawLength = raw.length;
				var array = new Uint8Array(new ArrayBuffer(rawLength));

				for(i = 0; i < rawLength; i++) {
					array[i] = raw.charCodeAt(i);
				}
				return array;
			};
			$scope.fileDownloadHandler = function () {
				console.log('downloading pdf as a file');
				var index = $scope.pdfUri.indexOf(BASE64_MARKER) + BASE64_MARKER.length;
				var blob = $scope.b64toBlob($scope.pdfUri.slice(index), 'application/pdf');
				console.log(blob);
				saveAs(blob, $scope.downloadFilename);

				/* somehow the non-chuncked way of constructing the blob does not work in safari
				 * there *has* to be a bracket around the binary array.
				 * aka
				 *         new Blob([  uInt8Array  ], {type: ''})
				 * */
				/** var uInt8Arry = $scope.convertDataURIToBinary($scope.pdfUri);
				console.log(uInt8Arry);
				var blob = new Blob([uInt8Arry], {type: 'application/pdf'});
				console.log(blob);
				saveAs(blob, $scope.downloadFilename); */
			};
			$scope.renderDocument = function () {
				$log.debug("Render Document");
				angular.forEach(canvases, function (canvas, index) {
					if (index == 0)
						$scope.renderInProgress = true;
					var pageNumber = index + $scope.pageNum;
					$scope.renderPage(pageNumber, canvas, function (success) {
						$log.debug("Rendered Page <" + pageNumber + "> SUCCESS <" + success + ">");
                        $scope.renderInProgress = false;
                        $scope.forceReRender = false;
					});
				});
			};
			$scope.loadPDF = function(path) {
				$log.debug('loadPDF <', path + '>');

				var deferred = $q.defer();
				PDFJS.getDocument(path, null, null, $scope.documentProgress).then(function(_pdfDoc) {
					$log.debug('Document read');
					$scope.pdfDoc = _pdfDoc;
                    if ($scope.loadProgress) {
                        $scope.loadProgress({state: "finished", loaded: 0, total: 0});
                    }
					deferred.resolve($scope.pdfDoc);
				}, function(message, exception) {
					$log.debug("PDF load error: " + message + " < " + exception + " > ");
					deferred.reject(message);
					if ($scope.loadProgress) {
						$scope.loadProgress({state: "error", loaded: 0, total: 0});
					}
				});
				return deferred.promise;
			};

			var PRINT_OUTPUT_SCALE = 2;
			$scope.renderPage = function(num, canvas, callback) {
				$log.debug('renderPage #' + num);
				var renderedPageInCanvas = canvas.getAttribute("rendered");
                if (renderedPageInCanvas === num && !$scope.forceReRender) {
                    $log.debug("Skipping page <"+num+">");
                    if (callback) {
                        callback(true);
                    }
                    return;
                }
				$scope.pdfDoc.getPage(num).then(function(page) {
					$scope.page = page;
					var viewport, ctx, windowWidth;
					if (angular.isNumber($scope.scale) ) {
						$scope.currentScale = $scope.scale == 0 ? 1 : $scope.scale;
					} else if ($scope.scale === 'fitWidth') {
						windowWidth = $scope.scrollWindow[0].offsetWidth;
						$scope.currentScale = windowWidth / $scope.page.getViewport(1).width;
					} else if (!$scope.currentScale) {
						$scope.currentScale = 1;
					}
					console.log($scope.currentScale);
					viewport = page.getViewport($scope.currentScale);
					ctx = canvas.getContext('2d');
					canvas.width = Math.floor(viewport.width) * PRINT_OUTPUT_SCALE;
					canvas.height = Math.floor(viewport.height) * PRINT_OUTPUT_SCALE;
					canvas.style.width = (PRINT_OUTPUT_SCALE * viewport.width) + 'px';
					canvas.style.height = (PRINT_OUTPUT_SCALE * viewport.height) + 'px';
					var cssScale = 'scale(' + (1 / PRINT_OUTPUT_SCALE) + ', ' +
						(1 / PRINT_OUTPUT_SCALE) + ')';
					angular.element(canvas)
						.css('transform' , cssScale)
						.css('transformOrigin' , '0% 0%')
						.css('margin-bottom' , - canvas.height / PRINT_OUTPUT_SCALE)
						.css('margin-right' , - canvas.width / PRINT_OUTPUT_SCALE)
					;
					ctx.scale(PRINT_OUTPUT_SCALE, PRINT_OUTPUT_SCALE);

					page.render({ canvasContext: ctx, viewport: viewport , intent: 'print'}).then(
						function() {
							canvas.setAttribute("rendered", num);
							if (callback) {
								callback(true);
							}
							$scope.$apply(function() {
								$scope.onPageLoad({ page: $scope.pageNum, total: $scope.pdfDoc.numPages });
							});
						}, 
						function() {
							if (callback) {
								callback(false);
							}
							$log.debug('page.render failed');
						}
					);
				});
			};
			$scope.retinaScaleHack = function (pdfPage) {

				var viewport = pdfPage.getViewport(1);
				// Use the same hack we use for high dpi displays for printing to get
				// better output until bug 811002 is fixed in FF.
				var PRINT_OUTPUT_SCALE = 2;
				var canvas = document.createElement('canvas');
				canvas.width = Math.floor(viewport.width) * PRINT_OUTPUT_SCALE;
				canvas.height = Math.floor(viewport.height) * PRINT_OUTPUT_SCALE;
				canvas.style.width = (PRINT_OUTPUT_SCALE * viewport.width) + 'pt';
				canvas.style.height = (PRINT_OUTPUT_SCALE * viewport.height) + 'pt';
				var cssScale = 'scale(' + (1 / PRINT_OUTPUT_SCALE) + ', ' +
					(1 / PRINT_OUTPUT_SCALE) + ')';
				CustomStyle.setProp('transform' , canvas, cssScale);
				CustomStyle.setProp('transformOrigin' , canvas, '0% 0%');

				var printContainer = document.getElementById('printContainer');
				var canvasWrapper = document.createElement('div');
				canvasWrapper.style.width = viewport.width + 'pt';
				canvasWrapper.style.height = viewport.height + 'pt';
				canvasWrapper.appendChild(canvas);
				printContainer.appendChild(canvasWrapper);

				canvas.mozPrintCallback = function(obj) {
					var ctx = obj.context;

					ctx.save();
					ctx.fillStyle = 'rgb(255, 255, 255)';
					ctx.fillRect(0, 0, canvas.width, canvas.height);
					ctx.restore();
					ctx.scale(PRINT_OUTPUT_SCALE, PRINT_OUTPUT_SCALE);

					var renderContext = {
						canvasContext: ctx,
						viewport: viewport,
						intent: 'print'
					};

					pdfPage.render(renderContext).promise.then(function() {
						// Tell the printEngine that rendering this canvas/page has finished.
						obj.done();
					}, function(error) {
						console.error(error);
						// Tell the printEngine that rendering this canvas/page has failed.
						// This will make the print proces stop.
						if ('abort' in obj) {
							obj.abort();
						} else {
							obj.done();
						}
					});
				};
			},

			$scope.$on('pdfviewer.setScale', function(evt, id, scale) {
				if (id !== instance_id) {
					return;
				}

				$scope.setScale(scale);
				$scope.renderDocument();
			});

			$scope.$on('pdfviewer.nextPage', function(evt, id) {
				if (id !== instance_id) {
					return;
				}

				if ($scope.pageNum < $scope.pdfDoc.numPages) {
					$scope.pageNum++;
					$scope.renderDocument();
				}
			});

			$scope.$on('pdfviewer.prevPage', function(evt, id) {
				if (id !== instance_id) {
					return;
				}

				if ($scope.pageNum > 1) {
					$scope.pageNum--;
					$scope.renderDocument();
				}
			});

			$scope.$on('pdfviewer.gotoPage', function(evt, id, page) {
				if (id !== instance_id) {
					return;
				}

				if (page >= 1 && page <= $scope.pdfDoc.numPages) {
					$scope.pageNum = page;
					$scope.renderDocument();
				}
			});
		} ],
		link: function(scope, iElement, iAttr) {
			var instance_id = iAttr.id;
			scope.scrollWindow = angular.element(iElement[0].querySelectorAll('.scroll-window'));
			scope.controlPopover = angular.element(iElement[0].querySelectorAll('.control-popover'));
			var group = angular.element('<div class="btn-group" role="group"></div>');
			var incScaleButton = angular.element('<button class="btn btn-default" ng-click="incScale()"><i class="fa fa-plus"></i></button>');
			var decScaleButton = angular.element('<button class="btn btn-default" ng-click="decScale()"><i class="fa fa-minus"></i></button>');
			var fitByWidth = angular.element('<button class="btn btn-default" ng-click="fitByWidth()"><i class="fa fa-arrows-h"></i></button>');
			var downloadButton = angular.element('<button class="btn btn-default" ng-click="fileDownloadHandler()"><i class="fa fa-save"></i></button>');
			group.append(incScaleButton);
			group.append(decScaleButton);
			group.append(fitByWidth);
			group.append(downloadButton);
			$compile(group)(scope);
			scope.controlPopover.append(group);

			var createCanvas = function(iElement, count){
				canvases = scope.scrollWindow.find('canvas');

				if (canvases.length > count) {
					//I need to remove canvases
					for (var i = count; i < canvases.length; i++) {
						angular.element(canvases[i]).remove();
					}
				} else {
					//I need to add more canvas
					for (var i = canvases.length; i < count; i++) {
						var tmpCanvas = angular.element('<canvas>');
						tmpCanvas[0].setAttribute("id", "page" + (i + 1));
						scope.scrollWindow.append(tmpCanvas);
					}
				}
				canvases = iElement.find('canvas');
			};
            var openDocCallback = function (pdfDoc){
                $log.debug('PDF Loaded');
                scope.currentPages = scope.pagesToShow == 0 ? scope.pdfDoc.numPages : Math.min(scope.pagesToShow, scope.pdfDoc.numPages);
                createCanvas(iElement, scope.currentPages);
                scope.renderDocument();
            };
			iAttr.$observe('src', function(v) {
				$log.debug('src attribute changed, new value is <' + v + ">");
				if (v !== undefined && v !== null && v !== '') {
					scope.pageNum = 1;
					scope.loadPDF(scope.src).then(openDocCallback, function(meg){
                        $log.debug(meg);
					});
				}
			});

			scope.$watch('pdfUri', function (newVal, oldVal){
				/* somehow initial load always have oldVal updated. */
				if (!newVal && !oldVal || newVal === oldVal) return;
				/* for safari, the uri is not supported without COR. So here we convert
				 * everything to a binary blob
				 * In Chrome, one can load scope.pdfUri directly. */
				scope.pageNum = 1;
				var uInt8Arry = scope.convertDataURIToBinary(scope.pdfUri);
				scope.loadPDF(uInt8Arry).then(openDocCallback, function(meg){
					$log.debug(meg);
				});
			});

			iAttr.$observe('pagesToShow', function (v) {
				//SKIP if rendering is in progress or document not loaded
				$log.debug('observerd pages to show change <' + v + '>');
				$log.debug('renderInProgress: <' + scope.renderInProgress + '>');
				$log.debug('pagesToShow is number? : <' + angular.isNumber(parseInt(v)) + '>');
				if (!angular.isNumber(parseInt(v))) {
					scope.pagesToShow = 0;
				}
				if (scope.pdfDoc == null || scope.renderInProgress ) {
					/* todo: should cancel the previous render instead. */
					scope.pagesToShow = v;
					return;
				}
				$log.debug('pages-to-show attribute changed, new value is <' + v + ">");
				console.log(scope.pdfDoc.numPages);
				scope.currentPages = scope.pagesToShow == 0 ? scope.pdfDoc.numPages : Math.min(scope.pagesToShow, scope.pdfDoc.numPages);
				createCanvas(iElement, scope.currentPages );
				scope.renderDocument();
				return;
			});
			iAttr.$observe('scale', function (v) {
				//SKIP if rendering is in progress or document not loaded
				$log.debug('observerd scale change <' + v + '>');
				scope.setScale(v);
				if (scope.pdfDoc == null || scope.renderInProgress) {
					/* todo: bug: if cancel progress here, nothing shows */
					//return;
				}
				scope.forceReRender = true;
				$log.debug('scale attribute changed, new value is <' + v + ">");
				scope.renderDocument();
			});
		}
	};
}]).
service("PDFViewerService", [ '$rootScope', function($rootScope) {

	var svc = { };
	svc.nextPage = function() {
		$rootScope.$broadcast('pdfviewer.nextPage');
	};

	svc.prevPage = function() {
		$rootScope.$broadcast('pdfviewer.prevPage');
	};

	svc.Instance = function(id) {
		var instance_id = id;

		return {
			prevPage: function() {
				$rootScope.$broadcast('pdfviewer.prevPage', instance_id);
			},
			nextPage: function() {
				$rootScope.$broadcast('pdfviewer.nextPage', instance_id);
			},
			gotoPage: function(page) {
				$rootScope.$broadcast('pdfviewer.gotoPage', instance_id, page);
			},
			setScale: function (scale) {
				$rootScope.$broadcast('pdfviewer.setScale', instance_id, scale);
			}
		};
	};

	return svc;
}]);
