
angular.module( 'omniwallet' )
  .factory( 'asset_types_template', function ( $q, $http ) {
    var deferred = $q.defer();

    $http.get( '/partials/asset_types.html' ).then( function( result ) {
      deferred.resolve( result.data );
    } );

    return deferred.promise;
  })
  .factory( 'asset_types_data', function ( $http, $q, $timeout, $injector ) {
    var count = 1;
    return {
      "getData": function() {
        console.log( '**** getData was run! ****' );
        var deferred = $q.defer();

        _.defer( function() {
          var wallet = $injector.get( 'userService' ).getWallet();
          if( wallet && wallet.addresses.length > 0 )
          {
            var requests = [];

            var balances = {};
            var currencyInfo;
            var emptyAddresses = [];

            var appraiser = $injector.get( 'appraiser' );

            wallet.addresses.forEach( function( addr ) {
              requests.push( addressRequest( $http, $q, addr ).then( function( result ) {
                result.data.balance.forEach( function( currencyItem ) {
                  if( !balances.hasOwnProperty( currencyItem.symbol )) {
                    balances[ currencyItem.symbol ] = {
                      "symbol": currencyItem.symbol,
                      "balance": parseFloat( currencyItem.value ),
                      "value": appraiser.getValue( currencyItem.value, currencyItem.symbol ),
                    };
                  }
                  else
                  {
                    balances[ currencyItem.symbol ].balance += parseFloat( currencyItem.value );
                    balances[ currencyItem.symbol ].value += appraiser.getValue( currencyItem.value, currencyItem.symbol );
                  }
                } );
              }));
            });
            requests.push( $http.get( '/v1/transaction/values.json' ).then( 
              function( result ) {
                currencyInfo = result.data;
              }
            ));
            $q.all( requests ).then( function( responses ) {
              if( currencyInfo )
              {
                currencyInfo.forEach( function( item ) {
                  if( balances.hasOwnProperty( item.currency ))
                    balances[ item.currency ].name = item.name;
                });

                deferred.resolve( 
                  { 
                    balances: balances,
                    currencies: currencyInfo
                  } );
              }
            } );
          }
          else
          {
            $http.get( '/v1/transaction/values.json' ).then( 
              function( currencyInfo ) {
                deferred.resolve( { currencies: currencyInfo } );
              }
            );
          } 
        });

        return deferred.promise;
      } 
    };
  })
  .directive( 'showAssetTypes', function( $compile, $injector ) {
    return {
      scope: true,
      link: function ( scope, element, attrs ) {
          var el;

          attrs.$observe( 'template', function ( tpl ) {
            if ( angular.isDefined( tpl ) ) {
              // compile the provided template against the current scope
              el = $compile( tpl )( scope );

              // stupid way of emptying the element
              element.html("");

              // add the template content
              element.append( el );
            }
          });
        }
    }
  } )
  .controller( 'AssetTypesController', function ( $modal, $rootScope, $injector, $scope, $element, asset_types_data, asset_types_template ) {

  var appraiser = $injector.get( 'appraiser' );
  $rootScope.$on( 'APPRAISER_VALUE_CHANGED', function() {
    $scope.showAssetTypes();
  });
    $scope.openAddForm = function( currency ) {

      var modalInstance = $modal.open({
        templateUrl: '/partials/add_' + currency + '_address_modal.html',
        controller: AddBtcAddressModal
      });

    modalInstance.result.then(function ( result ) {

        if( result.privKey && result.password )
        {
          $injector.get( 'userService' ).addAddress( 
            decodeAddressFromPrivateKey( result.privKey ), 
            encodePrivateKey( result.privKey, result.password ));
        }
        else if( result.address )
        {
          $injector.get( 'userService' ).addAddress( result.address );
        }
        $scope.showAssetTypes();

      }, function () {});
    };

    function updateGraph() {
      $scope.chart = {
          width : 300,
          height : 300
      }
      $scope.radius = Math.min($scope.chart.width, $scope.chart.height) / 2
      
      $element.find('#all-assets-graph').attr('height', $scope.chart.height).attr('width', $scope.chart.width);

      var color = d3.scale.category20()

      var arc = d3.svg.arc()
          .outerRadius($scope.radius - 10)
          .innerRadius(0);

      var pie = d3.layout.pie()
          .sort(null)
          .value(function(d) {  return d.value; });

      var svg = d3.select("#all-assets-graph")
      
      $scope.totalsPromise.then(function(successData) {

        var appraiser = $injector.get( 'appraiser' );
        var data = [], keys = Object.keys($scope.totals);
        keys.forEach(function(e,i) {
          var value = appraiser.getValue( $scope.totals[e], keys[i] );
          if( typeof value == 'number' && value > 0 )
          {
            data.push( { 
              value : value,
              name: keys[i], 
              color: data.length
            });
          }
          else
          {
            console.log( 'Not adding appraised value: ' + value + ' because it is not a number greater than 0.' );
          }
        });

        console.log( 'Graph data: ' );
        console.log( data );
        if( data.length > 0 )
        {
          var g = svg.selectAll(".arc")
              .data(pie(data))
            .enter().append("g")
              .attr("class", "arc");

          g.append("path")
              .attr("d", arc)
              .style("fill", function(d) {  return color(d.data.color); })
              .attr('transform', 'translate(150,150)');

          g.append("text")
              .attr("transform", function(d) { 
                  var c = arc.centroid(d);
                      return "translate(" + (150+ c[0]) + "," + (150 + c[1]) + ")";
                 })
              .attr("dy", ".35em")
              .style("text-anchor", "middle")
              .text(function(d) { return d.data.name; });

        }
        else
        {
          console.log( 'No market values are known, yet.' );
        }
      });
    }

    $scope.showAssetTypes = function () {

      $scope.items = asset_types_data.getData().then( function( balances ) {
        $scope.balances = balances;

        var total = 0;
        for( var k in balances.balances )
        {
          console.log( balances.balances[k] );
          if( typeof balances.balances[k].value == 'number' )
            total += balances.balances[k].value;
        }
        $scope.total = total;

        asset_types_template.then( function( templ ) {
          _.defer( function() {
            $scope.template = templ;
            $scope.$apply( updateGraph() );
          });
        }); 
      } );          
    };
  });

var AddBtcAddressModal = function ($scope, $modalInstance ) {
  $scope.ok = function ( result ) {
    $modalInstance.close( result );
  };

  $scope.cancel = function () {
    $modalInstance.dismiss('cancel');
  };
};

function addressRequest( $http, $q, addr ) {
  var deferred = $q.defer();


  $http.post( '/v1/address/addr/', { 'addr': addr.address } )
    .success( function( result ) {
      deferred.resolve( { data: result } );
    } ).error(
    function( error ) {
      deferred.resolve( {
        data: { 
          address: addr.address,
          balance: []
         }
      });
    }
  );

  return deferred.promise;
}
