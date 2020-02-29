(function (window, angular) {
    'use strict';
    /*参考文档：https://github.com/kamilkp/angular-sortable-view
     *改进者：广州银云信息科技有限公司
     */
    var $watch = [];
    angular.module('eolinker.directive')
        /*
         *这是所有的逻辑发生的地方。 
         *如果多个列表应该彼此连接，以便元素可以在它们之间移动，并且它们具有共同的祖先，则将此属性放在该元素上。 
         *如果没有，并且您仍然需要可多排序的行为，必须提供该属性的值。 
         *该值将用作将这些根连接在一起的标识符。
         */
        .directive('svGroupRoot', ['$rootScope', function ($rootScope) {
            function shouldBeAfter(elem, pointer, isGrid) { //转换节点时最低位置限制
                return isGrid ? elem.x - pointer.x < 0 : elem.y - pointer.y < 0;
            }

            function getSortableElements(key) { //获取排序节点
                return ROOTS_MAP[key];
            }

            function removeSortableElements(key) { //移除排序节点
                delete ROOTS_MAP[key];
            }

            var sortingInProgress;
            var ROOTS_MAP = Object.create(null); //外容器所包含的排序节点集
            // window.ROOTS_MAP = ROOTS_MAP; // for debug purposes
            return {
                restrict: 'A',
                controller: ['$scope', '$attrs', '$interpolate', '$parse', function ($scope, $attrs, $interpolate, $parse) {
                    var mapKey = $interpolate($attrs.svGroupRoot)($scope) || $scope.$id;
                    if (!ROOTS_MAP[mapKey]) ROOTS_MAP[mapKey] = [];
                    var that = this;
                    var candidates; // 设置可能目的地址集
                    var $placeholder; // 占位符节点
                    var options; // 排序选项
                    var $helper; // 协助节点 - 用鼠标指针拖动的节点

                    var $original; // 原始节点
                    var $target; // 最后完美目的地址
                    var isGrid = false; //是否为网格结构

                    var inputFun = $parse($attrs.fun)($scope);  
                    this.sortingInProgress = function () {
                        return sortingInProgress;
                    };
                    $watch.push($scope.$watch($attrs.disabled, function (currentVal, beforeVal) {
                        that.disabled = currentVal;
                    }))
                    $scope.$on("$destroy", function () {
                        $watch.map(function (val, key) {
                            val();
                        })
                    })
                    //移动更新
                    this.$moveUpdate = function (opts, mouse, svGroupElement, svOriginal, svPlaceholder, originatingPart, originatingIndex) {
                        //被移动元素的属性
                        if (that.disabled) return;
                        var svRect = svGroupElement[0].getBoundingClientRect();
                        if (opts.tolerance === 'element')
                            mouse = {
                                x: ~~(svRect.left + svRect.width / 2),
                                y: ~~(svRect.top + svRect.height / 2)
                            };

                        sortingInProgress = true;
                        candidates = []; //候选集
                        if (!$placeholder) {
                            if (svPlaceholder) { // 自定义占位符
                                $placeholder = svPlaceholder.clone();
                                $placeholder.removeClass('ng-hide');
                            } else { // 默认占位符
                                $placeholder = svOriginal.clone();
                                $placeholder.addClass('sv-group-placeholder');
                                $placeholder.css({
                                    'height': svGroupElement[0].height + 'px',
                                    'width': svGroupElement[0].width + 'px'
                                });
                            }
                            svOriginal.after($placeholder);
                            svOriginal.addClass('ng-hide');

                            // 缓存选项，帮助器和原始元素引用
                            $original = svOriginal;
                            options = opts;
                            $helper = svGroupElement;
                            $scope.$root && $scope.$root.$$phase || $scope.$apply();
                        }

                        // ----- 移动节点
                        $helper[0].reposition({
                            x: mouse.x + document.body.scrollLeft - mouse.offset.x * svRect.width,
                            y: mouse.y + document.body.scrollTop - mouse.offset.y * svRect.height
                        });
                        //----- 管理候选集
                        getSortableElements(mapKey).forEach(function (se, index) {
                            if (opts.containment != null) {
                                //优化，移动开始时计算
                                if (!elementMatchesSelector(se.element, opts.containment) &&
                                    !elementMatchesSelector(se.element, opts.containment + ' *')
                                ) return; // 元素不在允许的包含内
                            }
                            var rect = se.element[0].getBoundingClientRect();
                            var center = {
                                x: ~~(rect.left + rect.width / 2),
                                y: ~~(rect.top + rect.height / 2)
                            };
                            if (!se.container && // 不是容器元素
                                (se.element[0].scrollHeight || se.element[0].scrollWidth)) { // 节点可见
                                candidates.push({
                                    element: se.element,
                                    top: rect.top,
                                    view: se.getPart(),
                                    targetIndex: se.getIndex(),
                                    after: shouldBeAfter(center, mouse, isGrid)
                                });
                            }
                        });
                        var helpRect = $helper[0].getBoundingClientRect();
                        var placeholderRect = $placeholder[0].getBoundingClientRect();
                        var helpCenterTop = helpRect.top + helpRect.height / 2;
                        var rangeHeight = helpRect.height / 4;
                        candidates.push({
                            top: placeholderRect.top,
                            element: $placeholder,
                            placeholder: true
                        });
                        candidates.sort(function (a, b) {
                            return a.top - b.top;
                        });
                        var groupDepth=originatingPart.model(originatingPart.scope)[originatingIndex].groupDepth;
                        var initPaddingLeft=groupDepth==1?'10px':((groupDepth-1)*2+'em');
                        candidates.forEach(function (cand, index) {
                            let tmpTargetObj=originatingPart.model(originatingPart.scope)[cand.targetIndex];
                            let tmpFunRemoveClass=()=>{
                                if (!cand.placeholder) {
                                    candidates[candidates.length - 1].element.removeClass('sv-group-candidate-bottom');
                                    cand.element.removeClass('sv-group-candidate-top sv-group-candidate');
                                }
                            }
                            let tmpIsFilterInAndAfter=false;
                            if($attrs.disabledModelKey&&tmpTargetObj){
                                //判断是否为不能拖动到目标位置的节点
                                let tmpFilterObj=$parse($attrs.disabledModelKey)($scope);
                                
                                if(tmpFilterObj){
                                    if(typeof(tmpFilterObj)==='string'){
                                        if(tmpTargetObj[tmpFilterObj]){
                                            tmpFunRemoveClass();
                                            return;
                                        }
                                    }else {
                                        for(let val of tmpFilterObj){
                                            if(tmpTargetObj[val]){
                                                tmpFunRemoveClass();
                                                return;
                                            }
                                        }
                                    }
                                }
                            }
                            if($attrs.disabledInAndAfterModelKey&&tmpTargetObj){
                                let tmpFilterInAndAfterObj=$parse($attrs.disabledInAndAfterModelKey)($scope);
                                if(tmpFilterInAndAfterObj){
                                    if(typeof(tmpFilterInAndAfterObj)==='string'){
                                        if(tmpTargetObj[tmpFilterInAndAfterObj]){
                                            tmpIsFilterInAndAfter=true;
                                        }
                                    }else {
                                        for(let val of tmpFilterInAndAfterObj){
                                            if(tmpTargetObj[val]){
                                                tmpIsFilterInAndAfter=true;
                                                break;
                                            }
                                        }
                                    }
                                }
                            }
                            if (helpCenterTop > (index - 1 > -1 ? (candidates[index - 1].top + helpRect.height - rangeHeight) : (candidates[0].top - rangeHeight)) && helpCenterTop < (cand.top + rangeHeight)) {
                                if (!cand.placeholder) {
                                    $target = cand;
                                    $target.where = 'before';
                                    groupDepth=originatingPart.model(originatingPart.scope)[$target.targetIndex].groupDepth;
                                    $helper.children().css({
                                        'padding-left':groupDepth==1?'10px':((groupDepth-1)*2+'em')
                                    })
                                    cand.element.removeClass('sv-group-candidate');
                                    cand.element.addClass('sv-group-candidate-top');
                                } else {
                                    $target = null;
                                    $helper.children().css({
                                        'padding-left':initPaddingLeft
                                    })
                                }
                                return;
                            } 
                            let tmpIsCenter=!$parse($attrs.unLevel)($scope)&&helpCenterTop > (cand.top + rangeHeight) && helpCenterTop < (cand.top + helpRect.height - rangeHeight),
                            tmpIsAfter=helpCenterTop > (candidates[candidates.length - 1].top + helpRect.height - rangeHeight);
                            if(tmpIsFilterInAndAfter&&(tmpIsCenter||tmpIsAfter)){
                                tmpFunRemoveClass();
                                $target = null;
                            }else if (tmpIsCenter) {
                                if (!cand.placeholder) {
                                    $target = cand;
                                    $target.where = 'in';
                                    groupDepth=originatingPart.model(originatingPart.scope)[$target.targetIndex].groupDepth;
                                    $helper.children().css({
                                        'padding-left':groupDepth*2+'em'
                                    })
                                    cand.element.addClass('sv-group-candidate');
                                } else {
                                    $target = null;
                                    $helper.children().css({
                                        'padding-left':initPaddingLeft
                                    })
                                }
                            } else if (tmpIsAfter) {
                                if (!cand.placeholder) {
                                    $target = cand;
                                    $target.where = 'after';
                                    groupDepth=originatingPart.model(originatingPart.scope)[$target.targetIndex].groupDepth;
                                    $helper.children().css({
                                        'padding-left':groupDepth==1?'10px':((groupDepth-1)*2+'em')
                                    })
                                    cand.element.removeClass('sv-group-candidate-top sv-group-candidate');
                                    candidates[candidates.length - 1].element.addClass('sv-group-candidate-bottom');
                                } else {
                                    $target = null;
                                    $helper.children().css({
                                        'padding-left':initPaddingLeft
                                    })
                                }
                            } else {
                                tmpFunRemoveClass();
                            }
                        });
                    };

                    this.$drop = function (originatingPart, index, options) { //调整顺序 
                        if (that.disabled) return;
                        if (!$placeholder) return;
                        if (options.revert) {
                            var placeholderRect = $placeholder[0].getBoundingClientRect();
                            var helperRect = $helper[0].getBoundingClientRect();
                            var distance = Math.sqrt(
                                Math.pow(helperRect.top - placeholderRect.top, 2) +
                                Math.pow(helperRect.left - placeholderRect.left, 2)
                            );
                            var duration = +options.revert * distance / 200; // 恒定速度：持续时间取决于距离
                            duration = Math.min(duration, +options.revert); // 但是它不再是options.revert
                            ['-webkit-', '-moz-', '-ms-', '-o-', ''].forEach(function (prefix) {
                                if (typeof $helper[0].style[prefix + 'transition'] !== "undefined")
                                    $helper[0].style[prefix + 'transition'] = 'all ' + duration + 'ms ease';
                            });
                            setTimeout(afterRevert, duration);
                        } else {
                            afterRevert();
                        }

                        function afterRevert() { //布局恢复函数
                            sortingInProgress = false;
                            $placeholder.remove();
                            $helper.remove();
                            $original.removeClass('ng-hide');
                            candidates = void 0;
                            $placeholder = void 0;
                            options = void 0;
                            $helper = void 0;
                            $original = void 0;
                            if ($target) {
                                $target.element.removeClass('sv-group-candidate sv-group-candidate-top sv-group-candidate-bottom');
                                var targetIndex = $target.targetIndex;
                                if ($attrs.fun) {
                                    inputFun({
                                        originIndex:index,
                                        targetIndex:targetIndex,
                                        where: $target.where,
                                        from: originatingPart.model(originatingPart.scope)[index],
                                        to: originatingPart.model(originatingPart.scope)[targetIndex],
                                        groupList: originatingPart.model(originatingPart.scope),
                                    });
                                }
                            }
                            $target = void 0;
                            $scope.$root && $scope.$root.$$phase || $scope.$apply();
                        }
                    };

                    this.addToSortableElements = function (se) { //新建到排序节点集
                        getSortableElements(mapKey).push(se);
                    };
                    this.removeFromSortableElements = function (se) { //从原本排序节点集移除
                        var elems = getSortableElements(mapKey);
                        var index = elems.indexOf(se);
                        if (index > -1) {
                            elems.splice(index, 1);
                            if (elems.length === 0)
                                removeSortableElements(mapKey);
                        }
                    };
                }]
            };
        }])
        /*
         *此属性应放在作为ngRepeat的元素的容器的元素上。 其值应与ng-repeat属性中的右侧表达式相同。
         */
        .directive('svGroupPart', ['$parse', function ($parse) {
            return {
                restrict: 'A',
                require: '^svGroupRoot', //依赖svRoot指令
                controller: ['$scope', function ($scope) {
                    $scope.$svCtrl = this;
                    this.getPart = function () { //获取sv-root $scope.part
                        return $scope.part;
                    };
                    this.$drop = function (index, options) {
                        $scope.$sortableRoot.$drop($scope.part, index, options);
                    };
                }],
                scope: true,
                link: function ($scope, $element, $attrs, $sortable) {
                    if (!$attrs.svGroupPart) throw new Error('no model provided');
                    var model = $parse($attrs.svGroupPart);
                    if (!model.assign) throw new Error('model not assignable');
                    $scope.part = {
                        id: $scope.$id,
                        element: $element,
                        model: model,
                        scope: $scope
                    };
                    $scope.$sortableRoot = $sortable;

                    var sortablePart = {
                        element: $element,
                        getPart: $scope.$svCtrl.getPart,
                        container: true
                    };
                    $sortable.addToSortableElements(sortablePart);
                    $scope.$on('$destroy', function () {
                        $sortable.removeFromSortableElements(sortablePart);
                    });
                }
            };
        }])
        /*
         *此属性应放置在与ng-repeat属性相同的元素上。 
         *它的（可选）值应该是一个计算为options对象的表达式。
         *含：mousedown touchstart mousemove touchmove mouseup touchend touchcancel操作
         */
        .directive('svGroupElement', ['$parse', '$rootScope', function ($parse, $rootScope) {
            return {
                restrict: 'A',
                require: ['^svGroupPart', '^svGroupRoot'], //依赖svGroupPart以及svRoot指令
                controller: ['$scope', function ($scope) {
                    $scope.$svCtrl = this;
                }],
                link: function ($scope, $element, $attrs, $controllers) {
                    var sortableElement = {
                        element: $element,
                        getPart: $controllers[0].getPart,
                        getIndex: function () {
                            return $scope.$index;
                        }
                    };
                    var opts = $parse($attrs.svGroupElement)($scope);
                    var containment = null;
                    if (opts.containment) {
                        containment = closestElement.call($element, opts.containment);
                        var containmentRect = containment[0].getBoundingClientRect();
                    }
                    $controllers[1].addToSortableElements(sortableElement);
                    $scope.$on('$destroy', function () {
                        $controllers[1].removeFromSortableElements(sortableElement);
                    });
                    var body = angular.element(document.body);
                    var moveExecuted;
                    var interval = null;
                    var handle = $element;
                    var tmpMouseUpFun = $parse($attrs.mouseUp)($scope); 
                    handle.on('mousedown touchstart', onMousedown);
                    $rootScope.global.$watch.push($scope.$watch('$svCtrl.handle', function (customHandle) {
                        if (customHandle) {
                            handle.off('mousedown touchstart', onMousedown);
                            handle = customHandle;
                            handle.on('mousedown touchstart', onMousedown);
                        }
                    }));
                    var helper;
                    var placeholder;

                    function onMousedown(e) { //mouseDown函数
                        touchFix(e);
                        if ($controllers[1].sortingInProgress()) return;
                        if ($controllers[1].disabled) return;
                        if (e.button != 0 && e.type === 'mousedown') return;
                        moveExecuted = false;
                        opts = angular.extend({}, {
                            tolerance: 'pointer',
                            revert: 200,
                        }, opts);
                        var mouseMove = {
                            'down': e.pageY,
                        };
                        var target = $element;
                        var clientRect = $element[0].getBoundingClientRect();
                        var clone;
                        if (!helper) helper = $controllers[0].helper;
                        if (!placeholder) placeholder = $controllers[0].placeholder;
                        if (helper) {
                            clone = helper.clone();
                            clone.removeClass('ng-hide');
                            clone.css({
                                'left': clientRect.left + document.body.scrollLeft + 'px',
                                'top': clientRect.top + document.body.scrollTop + 'px'
                            });
                            target.addClass('sv-visibility-hidden');
                        } else {
                            clone = target.clone();
                            clone.addClass('sv-group-helper').css({
                                'left': clientRect.left + document.body.scrollLeft + 'px',
                                'top': clientRect.top + document.body.scrollTop + 'px',
                                'width': clientRect.width + 'px'
                            });
                        }
                        var scrollRange = 0;
                        clone[0].reposition = function (coords) { //克隆元素重定位
                            if (interval) {
                                clearInterval(interval)
                            }
                            var targetLeft = coords.x;
                            var targetTop = coords.y;
                            var helperRect = clone[0].getBoundingClientRect();
                            var body = document.body;
                            var parentContainer = angular.element(document.getElementsByClassName(opts.parentContainment));
                            var parentRect = parentContainer[0].getBoundingClientRect();
                            if (containmentRect) {
                                if (targetTop > (parentRect.top - helperRect.height) && targetTop < (parentRect.top + helperRect.height)) {
                                    //上边界
                                    scrollRange = parentContainer[0].scrollTop;
                                    interval = setInterval(function () {
                                        scrollRange = scrollRange - 10;
                                        parentContainer[0].scrollTop = scrollRange;
                                        if (scrollRange == 0) {
                                            clearInterval(interval)
                                        }
                                    }, 70);
                                } else if (targetTop > (parentRect.height + parentRect.top - helperRect.height) && targetTop < (parentRect.height + parentRect.top + helperRect.height / 4)) {
                                    //下边界
                                    scrollRange = parentContainer[0].scrollTop;
                                    interval = setInterval(function () {
                                        scrollRange = scrollRange + 10;
                                        parentContainer[0].scrollTop = scrollRange;
                                        if (scrollRange >= parentContainer[0].scrollHeight - parentRect.height) {
                                            clearInterval(interval)
                                        }
                                    }, 70);
                                }
                            }
                            this.style.top = targetTop - body.scrollTop + 'px';
                        };
                        var pointerOffset = {
                            x: (e.clientX - clientRect.left) / clientRect.width,
                            y: (e.clientY - clientRect.top) / clientRect.height
                        };
                        containment.addClass('sv-sorting-in-progress');

                        function onMousemove(e) {
                            mouseMove.move = e.pageY;
                            if (mouseMove.down - mouseMove.move > -5 && mouseMove.down - mouseMove.move < 5) return;
                            if ($controllers[1].disabled) return;
                            touchFix(e);
                            if (!moveExecuted) {
                                insertElementBefore($element, clone)
                                moveExecuted = true;
                            }
                            $controllers[1].$moveUpdate(opts, {
                                x: e.clientX,
                                y: e.clientY,
                                offset: pointerOffset
                            }, clone, $element, placeholder, $controllers[0].getPart(), $scope.$index);
                        }
                        containment.bind('mousemove', onMousemove).on('mouseup touchend touchcancel', function mouseup(e) {
                            if(tmpMouseUpFun)tmpMouseUpFun();
                            if (interval) {
                                clearInterval(interval)
                            }
                            containment.off('mousemove', onMousemove);
                            if (moveExecuted) {
                                $controllers[0].$drop($scope.$index, opts);
                            }
                            containment.removeClass('sv-sorting-in-progress');
                            $element.removeClass('sv-visibility-hidden');
                            containment.off('mouseup touchend touchcancel', mouseup);
                        });
                    }
                }
            };
        }])
        .directive('svGroupHandle', function () {
            return {
                require: '?^svGroupElement', //依赖svElement指令
                link: function ($scope, $element, $attrs, $svCtrl) {
                    if ($svCtrl)
                        $svCtrl.handle = $element.add($svCtrl.handle); // 支持新建多级把手
                }
            };
        });
    function touchFix(e) { //拖动位置匹配
        if (!('clientX' in e) && !('clientY' in e)) {
            var touches = e.touches || e.originalEvent.touches;
            if (touches && touches.length) {
                e.clientX = touches[0].clientX;
                e.clientY = touches[0].clientY;
            }
            e.preventDefault();
        }
    }

    function getPreviousSibling(element) { //获取上一级元素
        element = element[0];
        if (element.previousElementSibling)
            return angular.element(element.previousElementSibling);
        else {
            var sib = element.previousSibling;
            while (sib != null && sib.nodeType != 1)
                sib = sib.previousSibling;
            return angular.element(sib);
        }
    }

    function insertElementBefore(element, newElement) { //在被选元素内部的开头插入新节点
        var prevSibl = getPreviousSibling(element);
        if (prevSibl.length > 0) {
            prevSibl.after(newElement);
        } else {
            element.parent().prepend(newElement);
        }
    }

    var dde = document.documentElement,
        matchingFunction = dde.matches ? 'matches' :
        dde.matchesSelector ? 'matchesSelector' :
        dde.webkitMatches ? 'webkitMatches' :
        dde.webkitMatchesSelector ? 'webkitMatchesSelector' :
        dde.msMatches ? 'msMatches' :
        dde.msMatchesSelector ? 'msMatchesSelector' :
        dde.mozMatches ? 'mozMatches' :
        dde.mozMatchesSelector ? 'mozMatchesSelector' : null;
    if (matchingFunction == null)
        throw 'This browser doesn\'t support the HTMLElement.matches method';

    function elementMatchesSelector(element, selector) { //设置节点匹配选择器
        if (element instanceof angular.element) element = element[0];
        if (matchingFunction !== null)
            return element[matchingFunction](selector);
    }

    var closestElement = angular.element.prototype.closest || function (selector) {
        var el = this[0].parentNode;
        while (el !== document.documentElement && !el[matchingFunction](selector))
            el = el.parentNode;
        if (el[matchingFunction](selector))
            return angular.element(el);
        else
            return angular.element();
    };

    /*
        简单实现jQuery .add方法
     */
    if (typeof angular.element.prototype.add !== 'function') {
        angular.element.prototype.add = function (elem) {
            var i, res = angular.element();
            elem = angular.element(elem);
            for (i = 0; i < this.length; i++) {
                res.push(this[i]);
            }
            for (i = 0; i < elem.length; i++) {
                res.push(elem[i]);
            }
            return res;
        };
    }

})(window, window.angular);